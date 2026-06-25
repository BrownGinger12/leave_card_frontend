import { useRef, useState, useCallback, useEffect } from 'react'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useQueryClient, useMutation, useQuery } from '@tanstack/react-query'
import { Camera, Loader2, User } from 'lucide-react'
import ReactCrop, {
  centerCrop,
  makeAspectCrop,
  type Crop,
  type PixelCrop,
} from 'react-image-crop'
import 'react-image-crop/dist/ReactCrop.css'

import type { Employee } from '@/models/employee.model'
import {
  createEmployee,
  updateEmployee,
  uploadEmployeePhoto,
} from '@/services/employee.service'
import { getSchools } from '@/services/school.service'
import { getPositions } from '@/services/position.service'
import { cn } from '@/lib/utils'
import { resolveMediaUrl } from '@/lib/api'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

// ─── Schemas ──────────────────────────────────────────────────────────────────

const baseSchema = z.object({
  first_name: z.string().min(1, 'First name is required'),
  middle_name: z.string().optional(),
  last_name: z.string().min(1, 'Last name is required'),
  email: z.string().email('Invalid email address'),
  employee_type: z.enum(['TEACHING', 'NON_TEACHING'], {
    error: 'Employee type is required',
  }),
  employment_status: z.enum(
    ['PERMANENT', 'TEMPORARY', 'CASUAL', 'CONTRACT_OF_SERVICE'],
    { error: 'Employment status is required' }
  ),
  school_id: z.number({ required_error: 'School / Division is required' }).int().positive('School / Division is required'),
  position: z.string().optional(),
  contact_number: z.string().optional(),
  salary: z.preprocess(
    (v) => (v === '' || v == null ? undefined : Number(v)),
    z.number().positive('Salary must be a positive number').optional()
  ),
  original_appointment: z.string().optional(),
  latest_appointment: z.string().optional(),
})

const createSchema = baseSchema.extend({
  employee_number: z.string().min(1, 'Employee number is required'),
  leave_card_number: z.string().optional(),
})

type CreateFormValues = z.infer<typeof createSchema>
type EditFormValues = z.infer<typeof baseSchema>
type FormValues = CreateFormValues

// ─── Crop helpers ─────────────────────────────────────────────────────────────

function centerAspectCrop(
  mediaWidth: number,
  mediaHeight: number,
  aspect: number
): Crop {
  return centerCrop(
    makeAspectCrop({ unit: '%', width: 80 }, aspect, mediaWidth, mediaHeight),
    mediaWidth,
    mediaHeight
  )
}

async function getCroppedBlob(
  image: HTMLImageElement,
  pixelCrop: PixelCrop
): Promise<File> {
  const canvas = document.createElement('canvas')
  const scaleX = image.naturalWidth / image.width
  const scaleY = image.naturalHeight / image.height

  canvas.width = pixelCrop.width
  canvas.height = pixelCrop.height

  const ctx = canvas.getContext('2d')!
  ctx.drawImage(
    image,
    pixelCrop.x * scaleX,
    pixelCrop.y * scaleY,
    pixelCrop.width * scaleX,
    pixelCrop.height * scaleY,
    0,
    0,
    pixelCrop.width,
    pixelCrop.height
  )

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) return reject(new Error('Canvas is empty'))
        resolve(new File([blob], 'photo.jpg', { type: 'image/jpeg' }))
      },
      'image/jpeg',
      0.92
    )
  })
}

// ─── Small helpers ────────────────────────────────────────────────────────────

function FieldError({ message }: { message?: string }) {
  if (!message) return null
  return <p className="text-xs text-destructive mt-1">{message}</p>
}

function FormField({
  label,
  required,
  children,
  error,
  className,
}: {
  label: string
  required?: boolean
  children: React.ReactNode
  error?: string
  className?: string
}) {
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <Label>
        {label}
        {required && <span className="text-destructive ml-0.5">*</span>}
      </Label>
      {children}
      <FieldError message={error} />
    </div>
  )
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface EmployeeModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  employee?: Employee
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function EmployeeModal({
  open,
  onOpenChange,
  employee,
}: EmployeeModalProps) {
  const isEdit = !!employee
  const queryClient = useQueryClient()

  // ── form state ──────────────────────────────────────────────────────────────
  const [serverError, setServerError] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    control,
    setValue,
    watch,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(isEdit ? baseSchema : createSchema) as any,
    defaultValues: employee
      ? {
          first_name: employee.first_name,
          middle_name: employee.middle_name ?? '',
          last_name: employee.last_name,
          email: employee.email,
          employee_type: employee.employee_type,
          employment_status: employee.employment_status,
          school_id: employee.school_id,
          position: employee.position ?? '',
          contact_number: employee.contact_number ?? '',
          salary: employee.salary ?? ('' as any),
          original_appointment: employee.original_appointment ?? '',
          latest_appointment: employee.latest_appointment ?? '',
          employee_number: employee.employee_number,
          leave_card_number: employee.leave_card_number,
        }
      : {
          first_name: '',
          middle_name: '',
          last_name: '',
          email: '',
          position: '',
          contact_number: '',
          salary: '' as any,
          original_appointment: '',
          latest_appointment: '',
          employee_number: '',
          leave_card_number: '',
        },
  })

  // ── schools + positions ─────────────────────────────────────────────────────
  const employeeType = watch('employee_type')

  const { data: schools = [] } = useQuery({
    queryKey: ['schools'],
    queryFn: getSchools,
    staleTime: 10 * 60 * 1000,
  })

  const { data: positions = [] } = useQuery({
    queryKey: ['positions', employeeType],
    queryFn: () => getPositions(employeeType),
    enabled: !!employeeType,
    staleTime: 10 * 60 * 1000,
  })

  const prevTypeRef = useRef(employeeType)
  useEffect(() => {
    if (prevTypeRef.current !== employeeType) {
      setValue('position', '')
      prevTypeRef.current = employeeType
    }
  }, [employeeType, setValue])

  // ── photo state ─────────────────────────────────────────────────────────────
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [photoPreview, setPhotoPreview] = useState<string | null>(
    isEdit ? resolveMediaUrl(employee?.photo) : null
  )
  const [pendingPhoto, setPendingPhoto] = useState<File | null>(null)
  const [photoError, setPhotoError] = useState<string | null>(null)

  // ── crop dialog state ───────────────────────────────────────────────────────
  const [cropOpen, setCropOpen] = useState(false)
  const [cropSrc, setCropSrc] = useState<string>('')
  const [crop, setCrop] = useState<Crop>()
  const [completedCrop, setCompletedCrop] = useState<PixelCrop>()
  const imgRef = useRef<HTMLImageElement>(null)

  // ── photo upload mutation ───────────────────────────────────────────────────
  const photoMutation = useMutation({
    mutationFn: ({ id, file }: { id: number; file: File }) =>
      uploadEmployeePhoto(id, file),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['employees'] })
      setPhotoError(null)
    },
    onError: (err: any) => {
      setPhotoError(
        err?.response?.data?.message ?? 'Photo upload failed. Try again.'
      )
    },
  })

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      setCropSrc(reader.result as string)
      setCrop(undefined)
      setCompletedCrop(undefined)
      setCropOpen(true)
    }
    reader.readAsDataURL(file)
    e.target.value = ''
  }

  const onCropImageLoad = useCallback((e: React.SyntheticEvent<HTMLImageElement>) => {
    const { width, height } = e.currentTarget
    setCrop(centerAspectCrop(width, height, 1))
  }, [])

  async function handleCropConfirm() {
    if (!imgRef.current || !completedCrop) return
    try {
      const file = await getCroppedBlob(imgRef.current, completedCrop)
      const objectUrl = URL.createObjectURL(file)
      if (photoPreview?.startsWith('blob:')) URL.revokeObjectURL(photoPreview)
      setPhotoPreview(objectUrl)
      setCropOpen(false)
      if (isEdit && employee) {
        photoMutation.mutate({ id: employee.id, file })
      } else {
        setPendingPhoto(file)
      }
    } catch {
      setPhotoError('Failed to process the image. Please try again.')
    }
  }

  const displayPhoto = photoPreview

  // ── main form mutation ──────────────────────────────────────────────────────
  const mutation = useMutation({
    mutationFn: async (values: FormValues) => {
      if (isEdit && employee) {
        const payload: EditFormValues = {
          first_name: values.first_name,
          middle_name: values.middle_name || undefined,
          last_name: values.last_name,
          email: values.email,
          employee_type: values.employee_type,
          employment_status: values.employment_status,
          school_id: values.school_id,
          position: values.position || undefined,
          contact_number: values.contact_number || undefined,
          salary: values.salary || undefined,
          original_appointment: values.original_appointment || undefined,
          latest_appointment: values.latest_appointment || undefined,
        }
        return updateEmployee(employee.id, payload)
      }

      const created = await createEmployee({
        employee_number: (values as CreateFormValues).employee_number,
        leave_card_number: (values as CreateFormValues).leave_card_number || undefined,
        first_name: values.first_name,
        middle_name: values.middle_name || undefined,
        last_name: values.last_name,
        email: values.email,
        employee_type: values.employee_type,
        employment_status: values.employment_status,
        school_id: values.school_id,
        position: values.position || undefined,
        contact_number: values.contact_number || undefined,
        salary: values.salary || undefined,
        original_appointment: values.original_appointment || undefined,
        latest_appointment: values.latest_appointment || undefined,
      })

      if (pendingPhoto) await uploadEmployeePhoto(created.id, pendingPhoto)

      return created
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['employees'] })
      onOpenChange(false)
    },
    onError: (err: any) => {
      setServerError(
        err?.response?.data?.message ?? 'Something went wrong. Please try again.'
      )
    },
  })

  const onSubmit = (values: FormValues) => {
    setServerError(null)
    mutation.mutate(values)
  }

  const isPhotoUploading = photoMutation.isPending

  // ── render ──────────────────────────────────────────────────────────────────
  return (
    <>
      {/* ── Crop dialog ───────────────────────────────────────────────────── */}
      <Dialog open={cropOpen} onOpenChange={setCropOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Crop Photo</DialogTitle>
          </DialogHeader>

          <div className="flex justify-center overflow-hidden rounded-md bg-muted">
            <ReactCrop
              crop={crop}
              onChange={setCrop}
              onComplete={setCompletedCrop}
              aspect={1}
              circularCrop
              minWidth={80}
              minHeight={80}
            >
              <img
                ref={imgRef}
                src={cropSrc}
                alt="Crop preview"
                className="max-h-[50vh] object-contain"
                onLoad={onCropImageLoad}
              />
            </ReactCrop>
          </div>

          <p className="text-xs text-muted-foreground text-center">
            Drag to reposition · Resize handles to adjust
          </p>

          <DialogFooter showCloseButton>
            <Button onClick={handleCropConfirm} disabled={!completedCrop}>
              Apply Crop
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Employee form dialog ───────────────────────────────────────────── */}
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{isEdit ? 'Edit Employee' : 'Add Employee'}</DialogTitle>
          </DialogHeader>

          <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
            {/* ── Photo upload ──────────────────────────────────────────── */}
            <div className="flex flex-col items-center gap-2">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="group relative size-24 rounded-full overflow-hidden border-2 border-border bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {displayPhoto ? (
                  <img src={displayPhoto} alt="Profile" className="size-full object-cover" />
                ) : (
                  <User className="absolute inset-0 m-auto size-10 text-muted-foreground" />
                )}
                <span
                  className={cn(
                    'absolute inset-0 flex flex-col items-center justify-center gap-1 bg-black/50 transition-opacity',
                    isPhotoUploading ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                  )}
                >
                  {isPhotoUploading ? (
                    <Loader2 className="size-5 text-white animate-spin" />
                  ) : (
                    <>
                      <Camera className="size-5 text-white" />
                      <span className="text-[10px] text-white font-medium leading-none">
                        {displayPhoto ? 'Change' : 'Upload'}
                      </span>
                    </>
                  )}
                </span>
              </button>

              {photoError && <p className="text-xs text-destructive">{photoError}</p>}

              <p className="text-xs text-muted-foreground">
                PNG, JPG, JPEG, GIF · Click to {displayPhoto ? 'change' : 'upload'} photo
              </p>

              <input
                ref={fileInputRef}
                type="file"
                accept=".png,.jpg,.jpeg,.gif"
                className="hidden"
                onChange={handleFileChange}
              />
            </div>

            {/* ── Server error ──────────────────────────────────────────── */}
            {serverError && (
              <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {serverError}
              </p>
            )}

            {/* ── Name ─────────────────────────────────────────────────── */}
            <div className="grid grid-cols-3 gap-4">
              <FormField label="First Name" required error={errors.first_name?.message}>
                <Input {...register('first_name')} placeholder="First name" />
              </FormField>
              <FormField label="Middle Name" error={errors.middle_name?.message}>
                <Input {...register('middle_name')} placeholder="Middle name" />
              </FormField>
              <FormField label="Last Name" required error={errors.last_name?.message}>
                <Input {...register('last_name')} placeholder="Last name" />
              </FormField>
            </div>

            {/* ── Email ────────────────────────────────────────────────── */}
            <FormField label="Email Address" required error={errors.email?.message}>
              <Input {...register('email')} type="email" placeholder="Email address" />
            </FormField>

            {/* ── IDs (add only) ────────────────────────────────────────── */}
            {!isEdit && (
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  label="Employee Number"
                  required
                  error={(errors as any).employee_number?.message}
                >
                  <Input {...register('employee_number')} placeholder="Employee number" />
                </FormField>
                <FormField
                  label="Leave Card Number"
                  error={(errors as any).leave_card_number?.message}
                >
                  <Input
                    {...register('leave_card_number')}
                    placeholder="Auto-generated if left blank"
                  />
                </FormField>
              </div>
            )}

            {/* ── Employee number read-only (edit only) ─────────────────── */}
            {isEdit && (
              <FormField label="Employee Number">
                <Input value={employee?.employee_number} disabled />
              </FormField>
            )}

            {/* ── Type + Status ─────────────────────────────────────────── */}
            <div className="grid grid-cols-2 gap-4">
              <FormField
                label="Employee Type"
                required
                error={errors.employee_type?.message}
              >
                <Controller
                  control={control}
                  name="employee_type"
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Select type" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="TEACHING">Teaching</SelectItem>
                        <SelectItem value="NON_TEACHING">Non-Teaching</SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                />
              </FormField>

              <FormField
                label="Employment Status"
                required
                error={errors.employment_status?.message}
              >
                <Controller
                  control={control}
                  name="employment_status"
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Select status" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="PERMANENT">Permanent</SelectItem>
                        <SelectItem value="TEMPORARY">Temporary</SelectItem>
                        <SelectItem value="CASUAL">Casual</SelectItem>
                        <SelectItem value="CONTRACT_OF_SERVICE">
                          Contract of Service
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                />
              </FormField>
            </div>

            {/* ── Position + Division ───────────────────────────────────── */}
            <div className="grid grid-cols-2 gap-4">
              <FormField label="Position" error={errors.position?.message}>
                <Controller
                  control={control}
                  name="position"
                  render={({ field }) => (
                    <Select
                      value={field.value ?? ''}
                      onValueChange={field.onChange}
                      disabled={!employeeType}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder={employeeType ? 'Select position' : 'Select employee type first'} />
                      </SelectTrigger>
                      <SelectContent position="popper" className="max-h-63 overflow-y-auto">
                        {positions.map(p => (
                          <SelectItem key={p.id} value={p.name}>
                            {p.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              </FormField>
              <FormField label="School / Division" required error={(errors as any).school_id?.message}>
                <Controller
                  control={control}
                  name="school_id"
                  render={({ field }) => (
                    <Select
                      value={field.value ? String(field.value) : ''}
                      onValueChange={v => field.onChange(Number(v))}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Select school" />
                      </SelectTrigger>
                      <SelectContent position="popper" className="max-h-63 overflow-y-auto">
                        {schools.map(s => (
                          <SelectItem key={s.id} value={String(s.id)}>
                            {s.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              </FormField>
            </div>

            {/* ── Contact + Salary ──────────────────────────────────────── */}
            <div className="grid grid-cols-2 gap-4">
              <FormField label="Contact Number" error={errors.contact_number?.message}>
                <Input {...register('contact_number')} placeholder="Contact number" />
              </FormField>
              <FormField label="Salary" error={errors.salary?.message}>
                <Input
                  {...register('salary')}
                  type="number"
                  min={0}
                  step="0.01"
                  placeholder="Monthly salary"
                />
              </FormField>
            </div>

            {/* ── Appointments ──────────────────────────────────────────── */}
            <div className="grid grid-cols-2 gap-4">
              <FormField
                label="Original Appointment"
                error={errors.original_appointment?.message}
              >
                <Input {...register('original_appointment')} type="date" />
              </FormField>
              <FormField
                label="Latest Appointment"
                error={errors.latest_appointment?.message}
              >
                <Input {...register('latest_appointment')} type="date" />
              </FormField>
            </div>

            {/* ── Footer ───────────────────────────────────────────────── */}
            <DialogFooter showCloseButton>
              <Button
                type="submit"
                disabled={mutation.isPending || isPhotoUploading}
              >
                {mutation.isPending && <Loader2 className="size-4 animate-spin" />}
                {isEdit ? 'Save Changes' : 'Add Employee'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  )
}

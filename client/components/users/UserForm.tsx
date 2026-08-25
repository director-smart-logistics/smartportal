import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useLocale } from "@/hooks/useLocale";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { AlertCircle, Loader2, Info } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import type { UserDto, CreateUserDto } from "@/lib/hooks/queries/useUsers";

interface UserFormProps {
  mode: "create" | "edit";
  initialData?: UserDto;
  onSubmit: (data: CreateUserDto) => Promise<void>;
  isLoading?: boolean;
}

const USER_ROLES = ["ADMIN", "MANAGER", "STAFF", "AGENT", "DELIVERY"] as const;
const USER_STATUSES = ["active", "inactive", "suspended"] as const;

export function UserForm({
  mode,
  initialData,
  onSubmit,
  isLoading,
}: UserFormProps) {
  const { t } = useLocale(["users", "common"]);
  const { toast } = useToast();
  const navigate = useNavigate();

  const [formData, setFormData] = useState<CreateUserDto>({
    email: initialData?.email || "",
    fullName: initialData?.fullName || "",
    role: initialData?.role || "STAFF",
    phone: initialData?.phone || "",
    status: initialData?.status || "active",
  });

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [touched, setTouched] = useState<Record<string, boolean>>({});

  const validateField = (name: string, value: string) => {
    switch (name) {
      case "email":
        if (!value.trim()) {
          return t("users.emailRequired");
        }
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
          return t("users.emailInvalid");
        }
        break;
      case "fullName":
        if (!value.trim()) {
          return t("users.fullNameRequired");
        }
        if (value.trim().length < 2) {
          return "Name must be at least 2 characters";
        }
        break;
      case "role":
        if (!value) {
          return t("users.roleRequired");
        }
        break;
    }
    return "";
  };

  const handleChange = (name: string, value: string) => {
    setFormData((prev) => ({ ...prev, [name]: value }));

    // Validate on change if field has been touched
    if (touched[name]) {
      const error = validateField(name, value);
      setErrors((prev) => ({ ...prev, [name]: error }));
    }
  };

  const handleBlur = (name: string) => {
    setTouched((prev) => ({ ...prev, [name]: true }));
    const error = validateField(
      name,
      formData[name as keyof CreateUserDto] as string,
    );
    setErrors((prev) => ({ ...prev, [name]: error }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validate all fields
    const newErrors: Record<string, string> = {};
    Object.keys(formData).forEach((key) => {
      const error = validateField(
        key,
        formData[key as keyof CreateUserDto] as string,
      );
      if (error) newErrors[key] = error;
    });

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      setTouched(
        Object.keys(formData).reduce(
          (acc, key) => ({ ...acc, [key]: true }),
          {},
        ),
      );
      return;
    }

    try {
      await onSubmit(formData);
      toast({
        title:
          mode === "create" ? t("users.userCreated") : t("users.userUpdated"),
        variant: "default",
      });
      navigate("/users");
    } catch (error) {
      toast({
        title:
          mode === "create" ? t("users.createError") : t("users.updateError"),
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
    }
  };

  const getRoleLabel = (role: string) => {
    switch (role) {
      case "ADMIN":
        return t("users.admin");
      case "MANAGER":
        return t("users.manager");
      case "STAFF":
        return t("users.staff");
      case "AGENT":
        return t("users.agent");
      case "DELIVERY":
        return t("users.delivery");
      default:
        return role;
    }
  };

  return (
    <Card data-testid="user-form">
      <CardHeader>
        <CardTitle>
          {mode === "create" ? t("users.createUser") : t("users.editUser")}
        </CardTitle>
        <CardDescription>
          {mode === "create"
            ? "Fill in the details to create a new user account"
            : "Update the user account details"}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Email */}
          <div className="space-y-2">
            <Label htmlFor="email" className="required">
              {t("users.email")}
            </Label>
            <Input
              id="email"
              type="email"
              value={formData.email}
              onChange={(e) => handleChange("email", e.target.value)}
              onBlur={() => handleBlur("email")}
              disabled={isLoading}
              aria-invalid={!!errors.email}
              aria-describedby={errors.email ? "email-error" : undefined}
              data-testid="user-email-input"
              className={
                errors.email && touched.email ? "border-destructive" : ""
              }
            />
            {errors.email && touched.email && (
              <Alert variant="destructive" className="py-2" id="email-error">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{errors.email}</AlertDescription>
              </Alert>
            )}
          </div>

          {/* Full Name */}
          <div className="space-y-2">
            <Label htmlFor="fullName" className="required">
              {t("users.fullName")}
            </Label>
            <Input
              id="fullName"
              type="text"
              value={formData.fullName}
              onChange={(e) => handleChange("fullName", e.target.value)}
              onBlur={() => handleBlur("fullName")}
              disabled={isLoading}
              aria-invalid={!!errors.fullName}
              aria-describedby={errors.fullName ? "fullName-error" : undefined}
              data-testid="user-fullName-input"
              className={
                errors.fullName && touched.fullName ? "border-destructive" : ""
              }
            />
            {errors.fullName && touched.fullName && (
              <Alert variant="destructive" className="py-2" id="fullName-error">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{errors.fullName}</AlertDescription>
              </Alert>
            )}
          </div>

          {/* Google sign-in notice (create mode only) */}
          {mode === "create" && (
            <Alert className="border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950">
              <Info className="h-4 w-4 text-blue-600 dark:text-blue-400" />
              <AlertDescription className="text-blue-800 dark:text-blue-200 text-sm">
                El usuario recibirá un correo con instrucciones para acceder. El
                acceso es <strong>exclusivamente mediante Google</strong> — no
                se requiere contraseña.
              </AlertDescription>
            </Alert>
          )}

          {/* Role */}
          <div className="space-y-2">
            <Label htmlFor="role" className="required">
              {t("users.role")}
            </Label>
            <Select
              value={formData.role}
              onValueChange={(value) => handleChange("role", value)}
              disabled={isLoading}
            >
              <SelectTrigger
                id="role"
                aria-invalid={!!errors.role}
                aria-describedby={errors.role ? "role-error" : undefined}
                data-testid="user-role-select"
                className={
                  errors.role && touched.role ? "border-destructive" : ""
                }
              >
                <SelectValue placeholder={t("users.selectRole")} />
              </SelectTrigger>
              <SelectContent>
                {USER_ROLES.map((role) => (
                  <SelectItem
                    key={role}
                    value={role}
                    data-testid={`role-option-${role}`}
                  >
                    {getRoleLabel(role)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.role && touched.role && (
              <Alert variant="destructive" className="py-2" id="role-error">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{errors.role}</AlertDescription>
              </Alert>
            )}
          </div>

          {/* Phone */}
          <div className="space-y-2">
            <Label htmlFor="phone">{t("users.phone")}</Label>
            <Input
              id="phone"
              type="tel"
              value={formData.phone}
              onChange={(e) => handleChange("phone", e.target.value)}
              disabled={isLoading}
              data-testid="user-phone-input"
            />
          </div>

          {/* Status */}
          <div className="space-y-2">
            <Label htmlFor="status">{t("users.status")}</Label>
            <Select
              value={formData.status}
              onValueChange={(value) => handleChange("status", value)}
              disabled={isLoading}
            >
              <SelectTrigger id="status" data-testid="user-status-select">
                <SelectValue placeholder={t("users.selectStatus")} />
              </SelectTrigger>
              <SelectContent>
                {USER_STATUSES.map((status) => (
                  <SelectItem
                    key={status}
                    value={status}
                    data-testid={`status-option-${status}`}
                  >
                    {t(`users.${status}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-4">
            <Button
              type="submit"
              disabled={isLoading}
              data-testid="user-form-submit"
              className="bg-gray-900 text-gray-50 hover:bg-gray-800 dark:bg-gray-100 dark:text-gray-900 dark:hover:bg-gray-200"
            >
              {isLoading && (
                <Loader2
                  className="mr-2 h-4 w-4 animate-spin"
                  aria-hidden="true"
                />
              )}
              {mode === "create" ? t("users.create") : t("users.save")}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => navigate("/users")}
              disabled={isLoading}
              data-testid="user-form-cancel"
            >
              {t("users.cancel")}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

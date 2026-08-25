import { useState } from "react";
import { useLocale } from "@/hooks/useLocale";
import { useTheme } from "@/lib/context/ThemeContext";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
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
import { useCreateCustomer } from "@/lib/hooks/queries/useCustomers";
import { RouteSelector } from "@/components/routes/RouteSelector";

interface CreateCustomerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function CreateCustomerModal({
  isOpen,
  onClose,
  onSuccess,
}: CreateCustomerModalProps) {
  const { t } = useLocale(["customers", "common"]);
  const { theme } = useTheme();
  const { toast } = useToast();
  const createCustomerMutation = useCreateCustomer();

  const isDark = theme === "dark";

  const [isLoading, setIsLoading] = useState(false);
  const [formData, setFormData] = useState({
    fullName: "",
    firstName: "",
    lastName: "",
    dni: "",
    email: "",
    phone: "",
    address: "",
    city: "",
    country: "CR",
    zipCode: "",
    preferredRouteId: undefined as string | undefined,
    status: "active" as "active" | "inactive" | "suspended",
  });

  const [errors, setErrors] = useState<Record<string, string>>({});

  const validateForm = () => {
    const newErrors: Record<string, string> = {};

    if (!formData.fullName.trim()) {
      newErrors.fullName = t("common.required");
    }

    // ID Number is required
    if (!formData.dni.trim()) {
      newErrors.dni = t("customers.dniRequired");
    } else if (formData.dni.trim().length < 5) {
      newErrors.dni = t("customers.dniInvalid");
    }

    if (!formData.email.trim()) {
      newErrors.email = t("common.required");
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      newErrors.email = t("auth.invalidEmail");
    }

    if (!formData.phone.trim()) {
      newErrors.phone = t("common.required");
    }

    if (!formData.address.trim()) {
      newErrors.address = t("common.required");
    }

    if (!formData.city.trim()) {
      newErrors.city = t("common.required");
    }

    if (!formData.country.trim()) {
      newErrors.country = t("common.required");
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) {
      return;
    }

    try {
      setIsLoading(true);

      await createCustomerMutation.mutateAsync({
        fullName: formData.fullName,
        firstName: formData.firstName || undefined,
        lastName: formData.lastName || undefined,
        dni: formData.dni,
        email: formData.email,
        phone: formData.phone,
        address: formData.address,
        city: formData.city,
        country: formData.country,
        zipCode: formData.zipCode,
        preferredRouteId: formData.preferredRouteId,
        status: formData.status,
      });

      toast({
        title: t("common.success"),
        description: t("customers.createSuccess"),
        variant: "default",
      });

      setFormData({
        fullName: "",
        firstName: "",
        lastName: "",
        dni: "",
        email: "",
        phone: "",
        address: "",
        city: "",
        country: "CR",
        zipCode: "",
        preferredRouteId: undefined,
        status: "active",
      });

      onSuccess();
      onClose();
    } catch (error) {
      console.error("Failed to create customer:", error);
      toast({
        title: t("common.error"),
        description: t("customers.createError"),
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent
        className={
          isDark ? "bg-gray-900 border-gray-700" : "bg-white border-gray-200"
        }
        data-testid="create-customer-modal"
      >
        <DialogHeader>
          <DialogTitle className={isDark ? "text-white" : "text-gray-900"}>
            {t("customers.createNew")}
          </DialogTitle>
          <DialogDescription
            className={isDark ? "text-gray-400" : "text-gray-600"}
          >
            {t("customers.createDescription")}
          </DialogDescription>
        </DialogHeader>

        <form
          onSubmit={handleSubmit}
          className="space-y-4"
          data-testid="create-customer-form"
        >
          <div className="space-y-2">
            <Label
              htmlFor="fullName"
              className={isDark ? "text-gray-300" : "text-gray-700"}
              data-testid="label-fullname"
            >
              {t("profile.fullName")}
              <span className="text-red-500 ml-1">*</span>
            </Label>
            <Input
              id="fullName"
              placeholder={t("profile.fullName")}
              value={formData.fullName}
              onChange={(e) => {
                setFormData({ ...formData, fullName: e.target.value });
                if (errors.fullName) {
                  setErrors({ ...errors, fullName: "" });
                }
              }}
              className={
                isDark
                  ? "bg-gray-800 border-gray-600 text-white"
                  : "bg-white border-gray-300"
              }
              data-testid="input-fullname"
            />
            {errors.fullName && (
              <p className="text-sm text-red-500" data-testid="error-fullname">
                {errors.fullName}
              </p>
            )}
          </div>

          {/* ID Number - Required */}
          <div className="space-y-2">
            <Label
              htmlFor="dni"
              className={isDark ? "text-gray-300" : "text-gray-700"}
              data-testid="label-idnumber"
            >
              {t("customers.dni")}
              <span className="text-red-500 ml-1" aria-label="required">
                *
              </span>
            </Label>
            <Input
              id="dni"
              placeholder={t("customers.dniPlaceholder")}
              value={formData.dni}
              onChange={(e) => {
                setFormData({ ...formData, dni: e.target.value });
                if (errors.dni) {
                  setErrors({ ...errors, dni: "" });
                }
              }}
              className={
                isDark
                  ? "bg-gray-800 border-gray-600 text-white"
                  : "bg-white border-gray-300"
              }
              data-testid="input-idnumber"
              aria-required="true"
              aria-invalid={!!errors.dni}
              aria-describedby={errors.dni ? "error-idnumber" : undefined}
            />
            {errors.dni && (
              <p
                id="error-idnumber"
                className="text-sm text-red-500"
                data-testid="error-idnumber"
                role="alert"
              >
                {errors.dni}
              </p>
            )}
          </div>

          {/* Optional Name Components */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label
                htmlFor="firstName"
                className={isDark ? "text-gray-300" : "text-gray-700"}
                data-testid="label-firstname"
              >
                {t("customers.firstName")}
              </Label>
              <Input
                id="firstName"
                placeholder={t("customers.firstName")}
                value={formData.firstName}
                onChange={(e) =>
                  setFormData({ ...formData, firstName: e.target.value })
                }
                className={
                  isDark
                    ? "bg-gray-800 border-gray-600 text-white"
                    : "bg-white border-gray-300"
                }
                data-testid="input-firstname"
              />
            </div>

            <div className="space-y-2">
              <Label
                htmlFor="lastName"
                className={isDark ? "text-gray-300" : "text-gray-700"}
                data-testid="label-lastname"
              >
                {t("customers.lastName")}
              </Label>
              <Input
                id="lastName"
                placeholder={t("customers.lastName")}
                value={formData.lastName}
                onChange={(e) =>
                  setFormData({ ...formData, lastName: e.target.value })
                }
                className={
                  isDark
                    ? "bg-gray-800 border-gray-600 text-white"
                    : "bg-white border-gray-300"
                }
                data-testid="input-lastname"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label
              htmlFor="email"
              className={isDark ? "text-gray-300" : "text-gray-700"}
              data-testid="label-email"
            >
              {t("common.email")}
              <span className="text-red-500 ml-1">*</span>
            </Label>
            <Input
              id="email"
              type="email"
              placeholder={t("common.email")}
              value={formData.email}
              onChange={(e) => {
                setFormData({ ...formData, email: e.target.value });
                if (errors.email) {
                  setErrors({ ...errors, email: "" });
                }
              }}
              className={
                isDark
                  ? "bg-gray-800 border-gray-600 text-white"
                  : "bg-white border-gray-300"
              }
              data-testid="input-email"
            />
            {errors.email && (
              <p className="text-sm text-red-500" data-testid="error-email">
                {errors.email}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label
              htmlFor="phone"
              className={isDark ? "text-gray-300" : "text-gray-700"}
              data-testid="label-phone"
            >
              {t("common.phone")}
              <span className="text-red-500 ml-1">*</span>
            </Label>
            <Input
              id="phone"
              placeholder={t("common.phone")}
              value={formData.phone}
              onChange={(e) => {
                setFormData({ ...formData, phone: e.target.value });
                if (errors.phone) {
                  setErrors({ ...errors, phone: "" });
                }
              }}
              className={
                isDark
                  ? "bg-gray-800 border-gray-600 text-white"
                  : "bg-white border-gray-300"
              }
              data-testid="input-phone"
            />
            {errors.phone && (
              <p className="text-sm text-red-500" data-testid="error-phone">
                {errors.phone}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label
              htmlFor="address"
              className={isDark ? "text-gray-300" : "text-gray-700"}
              data-testid="label-address"
            >
              {t("common.address")}
              <span className="text-red-500 ml-1">*</span>
            </Label>
            <Input
              id="address"
              placeholder={t("common.address")}
              value={formData.address}
              onChange={(e) => {
                setFormData({ ...formData, address: e.target.value });
                if (errors.address) {
                  setErrors({ ...errors, address: "" });
                }
              }}
              className={
                isDark
                  ? "bg-gray-800 border-gray-600 text-white"
                  : "bg-white border-gray-300"
              }
              data-testid="input-address"
            />
            {errors.address && (
              <p className="text-sm text-red-500" data-testid="error-address">
                {errors.address}
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label
                htmlFor="city"
                className={isDark ? "text-gray-300" : "text-gray-700"}
                data-testid="label-city"
              >
                {t("profile.city")}
                <span className="text-red-500 ml-1">*</span>
              </Label>
              <Select
                value={formData.city}
                onValueChange={(value) => {
                  setFormData({ ...formData, city: value });
                  if (errors.city) setErrors({ ...errors, city: "" });
                }}
              >
                <SelectTrigger
                  id="city"
                  className={
                    isDark
                      ? "bg-gray-800 border-gray-600 text-white"
                      : "bg-white border-gray-300"
                  }
                  data-testid="select-city"
                >
                  <SelectValue placeholder={t("profile.city")} />
                </SelectTrigger>
                <SelectContent
                  className={
                    isDark
                      ? "bg-gray-800 border-gray-600"
                      : "bg-white border-gray-200"
                  }
                >
                  <SelectItem value="San José">San José</SelectItem>
                  <SelectItem value="Alajuela">Alajuela</SelectItem>
                  <SelectItem value="Cartago">Cartago</SelectItem>
                  <SelectItem value="Heredia">Heredia</SelectItem>
                  <SelectItem value="Guanacaste">Guanacaste</SelectItem>
                  <SelectItem value="Puntarenas">Puntarenas</SelectItem>
                  <SelectItem value="Limón">Limón</SelectItem>
                </SelectContent>
              </Select>
              {errors.city && (
                <p className="text-sm text-red-500" data-testid="error-city">
                  {errors.city}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label
                htmlFor="country"
                className={isDark ? "text-gray-300" : "text-gray-700"}
                data-testid="label-country"
              >
                {t("profile.country")}
                <span className="text-red-500 ml-1">*</span>
              </Label>
              <Select
                value={formData.country}
                onValueChange={(value) => {
                  setFormData({ ...formData, country: value });
                  if (errors.country) setErrors({ ...errors, country: "" });
                }}
              >
                <SelectTrigger
                  id="country"
                  className={
                    isDark
                      ? "bg-gray-800 border-gray-600 text-white"
                      : "bg-white border-gray-300"
                  }
                  data-testid="select-country"
                >
                  <SelectValue placeholder={t("profile.country")} />
                </SelectTrigger>
                <SelectContent
                  className={
                    isDark
                      ? "bg-gray-800 border-gray-600"
                      : "bg-white border-gray-200"
                  }
                >
                  <SelectItem value="CR">Costa Rica</SelectItem>
                  <SelectItem value="MX">México</SelectItem>
                  <SelectItem value="GT">Guatemala</SelectItem>
                  <SelectItem value="SV">El Salvador</SelectItem>
                  <SelectItem value="HN">Honduras</SelectItem>
                  <SelectItem value="NI">Nicaragua</SelectItem>
                  <SelectItem value="PA">Panamá</SelectItem>
                  <SelectItem value="AR">Argentina</SelectItem>
                  <SelectItem value="BO">Bolivia</SelectItem>
                  <SelectItem value="BR">Brasil</SelectItem>
                  <SelectItem value="CL">Chile</SelectItem>
                  <SelectItem value="CO">Colombia</SelectItem>
                  <SelectItem value="EC">Ecuador</SelectItem>
                  <SelectItem value="PY">Paraguay</SelectItem>
                  <SelectItem value="PE">Perú</SelectItem>
                  <SelectItem value="UY">Uruguay</SelectItem>
                  <SelectItem value="VE">Venezuela</SelectItem>
                  <SelectItem value="DO">República Dominicana</SelectItem>
                  <SelectItem value="CU">Cuba</SelectItem>
                  <SelectItem value="US">United States</SelectItem>
                </SelectContent>
              </Select>
              {errors.country && (
                <p className="text-sm text-red-500" data-testid="error-country">
                  {errors.country}
                </p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label
                htmlFor="zipCode"
                className={isDark ? "text-gray-300" : "text-gray-700"}
                data-testid="label-zipcode"
              >
                {t("profile.zipCode")}
              </Label>
              <Input
                id="zipCode"
                placeholder={t("profile.zipCode")}
                value={formData.zipCode}
                onChange={(e) =>
                  setFormData({ ...formData, zipCode: e.target.value })
                }
                className={
                  isDark
                    ? "bg-gray-800 border-gray-600 text-white"
                    : "bg-white border-gray-300"
                }
                data-testid="input-zipcode"
              />
            </div>

            <div className="space-y-2">
              <Label
                htmlFor="status"
                className={isDark ? "text-gray-300" : "text-gray-700"}
                data-testid="label-status"
              >
                {t("packages.status")}
              </Label>
              <Select
                value={formData.status}
                onValueChange={(value: any) =>
                  setFormData({ ...formData, status: value })
                }
              >
                <SelectTrigger
                  id="status"
                  className={
                    isDark
                      ? "bg-gray-800 border-gray-600 text-white"
                      : "bg-white border-gray-300"
                  }
                  data-testid="select-status"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent
                  className={
                    isDark
                      ? "bg-gray-800 border-gray-600"
                      : "bg-white border-gray-200"
                  }
                >
                  <SelectItem value="active" data-testid="status-active">
                    {t("customers.statusActive")}
                  </SelectItem>
                  <SelectItem value="inactive" data-testid="status-inactive">
                    {t("customers.statusInactive")}
                  </SelectItem>
                  <SelectItem value="suspended" data-testid="status-suspended">
                    {t("customers.statusSuspended")}
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Route Preference - Optional */}
          <RouteSelector
            value={formData.preferredRouteId}
            onValueChange={(value) =>
              setFormData({ ...formData, preferredRouteId: value })
            }
            error={errors.preferredRouteId}
            className="mt-4"
          />
        </form>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={onClose}
            disabled={isLoading}
            data-testid="btn-cancel"
            className={
              isDark ? "border-gray-600 text-gray-300 hover:bg-gray-800" : ""
            }
          >
            {t("common.cancel")}
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={isLoading}
            data-testid="btn-create"
            className="bg-black text-white hover:bg-gray-800 dark:bg-white dark:text-black dark:hover:bg-gray-200"
          >
            {isLoading ? t("common.loading") : t("customers.create")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

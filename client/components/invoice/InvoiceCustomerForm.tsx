import { useState, useCallback, useRef, useEffect } from "react";
import { useLocale } from "@/hooks/useLocale";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Loader2, UserPlus, AlertCircle, CheckCircle } from "lucide-react";

interface CustomerFormData {
  fullName: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  country: string;
  slCode: string;
  deliveryAddress1: string;
}

interface InvoiceCustomerFormProps {
  isDark: boolean;
  onCustomerCreated: (customer: {
    id: string;
    fullName: string;
    email: string;
    slCode?: string;
  }) => void;
  isCreating: boolean;
  onSubmit: (data: CustomerFormData) => Promise<void>;
}

const initialFormData: CustomerFormData = {
  fullName: "",
  email: "",
  phone: "",
  address: "",
  city: "",
  country: "",
  slCode: "",
  deliveryAddress1: "",
};

export function InvoiceCustomerForm({
  isDark,
  onCustomerCreated,
  isCreating,
  onSubmit,
}: InvoiceCustomerFormProps) {
  const { t } = useLocale(["invoices", "common"]);
  const [formData, setFormData] = useState<CustomerFormData>(initialFormData);
  const [errors, setErrors] = useState<
    Partial<Record<keyof CustomerFormData, string>>
  >({});
  const [touched, setTouched] = useState<
    Partial<Record<keyof CustomerFormData, boolean>>
  >({});

  // Refs for keyboard navigation
  const fullNameRef = useRef<HTMLInputElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const phoneRef = useRef<HTMLInputElement>(null);
  const addressRef = useRef<HTMLInputElement>(null);
  const cityRef = useRef<HTMLInputElement>(null);
  const countryRef = useRef<HTMLInputElement>(null);
  const slCodeRef = useRef<HTMLInputElement>(null);
  const deliveryAddressRef = useRef<HTMLInputElement>(null);
  const submitButtonRef = useRef<HTMLButtonElement>(null);

  // Focus first field on mount
  useEffect(() => {
    fullNameRef.current?.focus();
  }, []);

  const validateEmail = (email: string): boolean => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  };

  const validateField = useCallback(
    (field: keyof CustomerFormData, value: string): string => {
      switch (field) {
        case "fullName":
          if (!value.trim()) return t("createCustomer.fullNameRequired");
          if (value.trim().length < 2)
            return t("createCustomer.fullNameRequired");
          return "";
        case "email":
          if (!value.trim()) return t("createCustomer.emailRequired");
          if (!validateEmail(value)) return t("createCustomer.emailInvalid");
          return "";
        default:
          return "";
      }
    },
    [t],
  );

  const handleChange = useCallback(
    (field: keyof CustomerFormData, value: string) => {
      setFormData((prev) => ({ ...prev, [field]: value }));

      // Validate on change if field was touched
      if (touched[field]) {
        const error = validateField(field, value);
        setErrors((prev) => ({ ...prev, [field]: error }));
      }
    },
    [touched, validateField],
  );

  const handleBlur = useCallback(
    (field: keyof CustomerFormData) => {
      setTouched((prev) => ({ ...prev, [field]: true }));
      const error = validateField(field, formData[field]);
      setErrors((prev) => ({ ...prev, [field]: error }));
    },
    [formData, validateField],
  );

  const handleKeyDown = useCallback(
    (
      e: React.KeyboardEvent<HTMLInputElement>,
      nextRef: React.RefObject<HTMLInputElement | HTMLButtonElement>,
    ) => {
      if (e.key === "Enter") {
        e.preventDefault();
        nextRef.current?.focus();
      }
    },
    [],
  );

  const validateForm = useCallback((): boolean => {
    const newErrors: Partial<Record<keyof CustomerFormData, string>> = {};
    let isValid = true;

    // Validate required fields
    const fullNameError = validateField("fullName", formData.fullName);
    if (fullNameError) {
      newErrors.fullName = fullNameError;
      isValid = false;
    }

    const emailError = validateField("email", formData.email);
    if (emailError) {
      newErrors.email = emailError;
      isValid = false;
    }

    setErrors(newErrors);
    setTouched({ fullName: true, email: true });
    return isValid;
  }, [formData, validateField]);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();

      if (!validateForm()) {
        // Focus first error field
        if (errors.fullName) {
          fullNameRef.current?.focus();
        } else if (errors.email) {
          emailRef.current?.focus();
        }
        return;
      }

      await onSubmit(formData);
    },
    [formData, validateForm, errors, onSubmit],
  );

  const inputClassName = (hasError: boolean) => `
    ${isDark ? "bg-gray-800 border-gray-700 text-white placeholder:text-gray-500" : "bg-white border-gray-300 text-gray-900 placeholder:text-gray-400"}
    ${hasError ? "border-red-500 focus:ring-red-500" : "focus:ring-blue-500"}
    transition-colors
  `;

  const labelClassName = `text-sm font-medium ${isDark ? "text-gray-300" : "text-gray-700"}`;

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-4"
      data-testid="invoice-customer-form"
      aria-label={t("createCustomer.title")}
      noValidate
    >
      {/* Full Name - Required */}
      <div className="space-y-1.5">
        <Label htmlFor="customer-fullName" className={labelClassName}>
          {t("createCustomer.fullName")} <span className="text-red-500">*</span>
        </Label>
        <Input
          ref={fullNameRef}
          id="customer-fullName"
          type="text"
          value={formData.fullName}
          onChange={(e) => handleChange("fullName", e.target.value)}
          onBlur={() => handleBlur("fullName")}
          onKeyDown={(e) => handleKeyDown(e, emailRef)}
          placeholder={t("createCustomer.fullNamePlaceholder")}
          className={inputClassName(!!errors.fullName)}
          aria-required="true"
          aria-invalid={!!errors.fullName}
          aria-describedby={errors.fullName ? "fullName-error" : undefined}
          data-testid="customer-fullName-input"
          autoComplete="name"
        />
        {errors.fullName && (
          <p
            id="fullName-error"
            className="text-xs text-red-500 flex items-center gap-1"
            role="alert"
          >
            <AlertCircle className="h-3 w-3" />
            {errors.fullName}
          </p>
        )}
      </div>

      {/* Email - Required */}
      <div className="space-y-1.5">
        <Label htmlFor="customer-email" className={labelClassName}>
          {t("createCustomer.email")} <span className="text-red-500">*</span>
        </Label>
        <Input
          ref={emailRef}
          id="customer-email"
          type="email"
          value={formData.email}
          onChange={(e) => handleChange("email", e.target.value)}
          onBlur={() => handleBlur("email")}
          onKeyDown={(e) => handleKeyDown(e, phoneRef)}
          placeholder={t("createCustomer.emailPlaceholder")}
          className={inputClassName(!!errors.email)}
          aria-required="true"
          aria-invalid={!!errors.email}
          aria-describedby={errors.email ? "email-error" : undefined}
          data-testid="customer-email-input"
          autoComplete="email"
        />
        {errors.email && (
          <p
            id="email-error"
            className="text-xs text-red-500 flex items-center gap-1"
            role="alert"
          >
            <AlertCircle className="h-3 w-3" />
            {errors.email}
          </p>
        )}
      </div>

      {/* Phone - Optional */}
      <div className="space-y-1.5">
        <Label htmlFor="customer-phone" className={labelClassName}>
          {t("createCustomer.phone")}
        </Label>
        <Input
          ref={phoneRef}
          id="customer-phone"
          type="tel"
          value={formData.phone}
          onChange={(e) => handleChange("phone", e.target.value)}
          onKeyDown={(e) => handleKeyDown(e, addressRef)}
          placeholder={t("createCustomer.phonePlaceholder")}
          className={inputClassName(false)}
          data-testid="customer-phone-input"
          autoComplete="tel"
        />
      </div>

      {/* Address and City - Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="customer-address" className={labelClassName}>
            {t("createCustomer.address")}
          </Label>
          <Input
            ref={addressRef}
            id="customer-address"
            type="text"
            value={formData.address}
            onChange={(e) => handleChange("address", e.target.value)}
            onKeyDown={(e) => handleKeyDown(e, cityRef)}
            placeholder={t("createCustomer.addressPlaceholder")}
            className={inputClassName(false)}
            data-testid="customer-address-input"
            autoComplete="street-address"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="customer-city" className={labelClassName}>
            {t("createCustomer.city")}
          </Label>
          <Input
            ref={cityRef}
            id="customer-city"
            type="text"
            value={formData.city}
            onChange={(e) => handleChange("city", e.target.value)}
            onKeyDown={(e) => handleKeyDown(e, countryRef)}
            placeholder={t("createCustomer.cityPlaceholder")}
            className={inputClassName(false)}
            data-testid="customer-city-input"
            autoComplete="address-level2"
          />
        </div>
      </div>

      {/* Country and SL Account Code - Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="customer-country" className={labelClassName}>
            {t("createCustomer.country")}
          </Label>
          <Input
            ref={countryRef}
            id="customer-country"
            type="text"
            value={formData.country}
            onChange={(e) => handleChange("country", e.target.value)}
            onKeyDown={(e) => handleKeyDown(e, slCodeRef)}
            placeholder={t("createCustomer.countryPlaceholder")}
            className={inputClassName(false)}
            data-testid="customer-country-input"
            autoComplete="country-name"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="customer-slCode" className={labelClassName}>
            {t("createCustomer.slCode")}
          </Label>
          <Input
            ref={slCodeRef}
            id="customer-slCode"
            type="text"
            value={formData.slCode}
            onChange={(e) => handleChange("slCode", e.target.value)}
            onKeyDown={(e) => handleKeyDown(e, deliveryAddressRef)}
            placeholder={t("createCustomer.slCodePlaceholder")}
            className={inputClassName(false)}
            data-testid="customer-slCode-input"
          />
          <p
            className={`text-xs ${isDark ? "text-gray-500" : "text-gray-500"}`}
          >
            {t("createCustomer.slCodeHelp")}
          </p>
        </div>
      </div>

      {/* Delivery Address - Optional */}
      <div className="space-y-1.5">
        <Label htmlFor="customer-deliveryAddress" className={labelClassName}>
          {t("createCustomer.deliveryAddress")}
        </Label>
        <Input
          ref={deliveryAddressRef}
          id="customer-deliveryAddress"
          type="text"
          value={formData.deliveryAddress1}
          onChange={(e) => handleChange("deliveryAddress1", e.target.value)}
          onKeyDown={(e) => handleKeyDown(e, submitButtonRef)}
          placeholder={t("createCustomer.deliveryAddressPlaceholder")}
          className={inputClassName(false)}
          data-testid="customer-deliveryAddress-input"
        />
      </div>

      {/* Submit Button */}
      <div className="pt-2">
        <Button
          ref={submitButtonRef}
          type="submit"
          disabled={isCreating}
          className={`w-full flex items-center justify-center gap-2 ${
            isDark
              ? "bg-white text-black hover:bg-gray-100"
              : "bg-black text-white hover:bg-gray-900"
          }`}
          data-testid="create-customer-submit-btn"
          aria-busy={isCreating}
        >
          {isCreating ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              {t("createCustomer.creating")}
            </>
          ) : (
            <>
              <UserPlus className="h-4 w-4" aria-hidden="true" />
              {t("createCustomer.createButton")}
            </>
          )}
        </Button>
      </div>
    </form>
  );
}

export default InvoiceCustomerForm;

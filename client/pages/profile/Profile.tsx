import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useLocale } from "@/hooks/useLocale";
import { DashboardLayout } from "@/components/layouts/DashboardLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Mail, Lock, User, Calendar, MapPin } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function Profile() {
  const { user } = useAuth();
  const { t } = useLocale(['profile', 'common']);
  const { toast } = useToast();

  // Edit Profile Form
  const [editMode, setEditMode] = useState(false);
  const [formData, setFormData] = useState({
    fullName: user?.fullName || "",
    email: user?.email || "",
    phone: "",
    address: "",
    city: "",
    country: "",
    zipCode: "",
  });

  // Password Change Form
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });

  const handleFormChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData((prev) => ({
      ...prev,
      [e.target.name]: e.target.value,
    }));
  };

  const handlePasswordChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setPasswordForm((prev) => ({
      ...prev,
      [e.target.name]: e.target.value,
    }));
  };

  const handleSaveProfile = () => {
    // TODO: Implement API call to save profile
    toast({
      title: t("updateSuccess"),
      description: "Your profile has been updated",
    });
    setEditMode(false);
  };

  const handleChangePassword = () => {
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      toast({
        title: t("common.error"),
        description: t("auth.passwordsMismatch"),
        variant: "destructive",
      });
      return;
    }

    // TODO: Implement API call to change password
    toast({
      title: t("passwordChangeSuccess"),
      description: "Your password has been changed",
    });

    setPasswordForm({
      currentPassword: "",
      newPassword: "",
      confirmPassword: "",
    });
  };

  return (
    <DashboardLayout>
      <div className="p-4 md:p-6 space-y-6">
        {/* Header */}
        <div className="space-y-2">
          <h1 className="text-2xl md:text-3xl font-bold text-foreground">
            {t("myProfile")}
          </h1>
          <p className="text-sm text-muted-foreground">
            {t("personalInfo")}
          </p>
        </div>

        {/* Profile Content */}
        <Tabs defaultValue="info" className="space-y-4">
          <TabsList className="grid w-full max-w-md grid-cols-2">
            <TabsTrigger value="info">{t("personalInfo")}</TabsTrigger>
            <TabsTrigger value="password">
              {t("changePassword")}
            </TabsTrigger>
          </TabsList>

          {/* Personal Information Tab */}
          <TabsContent value="info" className="space-y-4">
            <Card className="p-4 md:p-6">
              <div className="space-y-6">
                {/* Current Info Display */}
                {!editMode && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="p-3 rounded-lg bg-muted/50">
                      <div className="flex items-center gap-2 mb-1">
                        <User className="h-4 w-4 text-muted-foreground" />
                        <p className="text-xs text-muted-foreground">
                          {t("fullName")}
                        </p>
                      </div>
                      <p className="text-sm font-semibold text-foreground">
                        {user?.fullName}
                      </p>
                    </div>
                    <div className="p-3 rounded-lg bg-muted/50">
                      <div className="flex items-center gap-2 mb-1">
                        <Mail className="h-4 w-4 text-muted-foreground" />
                        <p className="text-xs text-muted-foreground">
                          {t("email")}
                        </p>
                      </div>
                      <p className="text-sm font-semibold text-foreground">
                        {user?.email}
                      </p>
                    </div>
                    <div className="p-3 rounded-lg bg-muted/50">
                      <div className="flex items-center gap-2 mb-1">
                        <Lock className="h-4 w-4 text-muted-foreground" />
                        <p className="text-xs text-muted-foreground">
                          {t("users.role")}
                        </p>
                      </div>
                      <p className="text-sm font-semibold text-foreground">
                        {user?.role}
                      </p>
                    </div>
                    <div className="p-3 rounded-lg bg-muted/50">
                      <div className="flex items-center gap-2 mb-1">
                        <Calendar className="h-4 w-4 text-muted-foreground" />
                        <p className="text-xs text-muted-foreground">
                          {t("joinedDate")}
                        </p>
                      </div>
                      <p className="text-sm font-semibold text-foreground">
                        Jan 15, 2024
                      </p>
                    </div>
                  </div>
                )}

                {/* Edit Form */}
                {editMode && (
                  <div className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="fullName">
                          {t("fullName")}
                        </Label>
                        <Input
                          id="fullName"
                          name="fullName"
                          value={formData.fullName}
                          onChange={handleFormChange}
                          className="text-sm"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="phone">{t("phone")}</Label>
                        <Input
                          id="phone"
                          name="phone"
                          value={formData.phone}
                          onChange={handleFormChange}
                          className="text-sm"
                        />
                      </div>
                      <div className="space-y-2 md:col-span-2">
                        <Label htmlFor="address">{t("address")}</Label>
                        <Input
                          id="address"
                          name="address"
                          value={formData.address}
                          onChange={handleFormChange}
                          placeholder="Street address"
                          className="text-sm"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="city">{t("city")}</Label>
                        <Input
                          id="city"
                          name="city"
                          value={formData.city}
                          onChange={handleFormChange}
                          className="text-sm"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="country">{t("country")}</Label>
                        <Input
                          id="country"
                          name="country"
                          value={formData.country}
                          onChange={handleFormChange}
                          className="text-sm"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="zipCode">{t("zipCode")}</Label>
                        <Input
                          id="zipCode"
                          name="zipCode"
                          value={formData.zipCode}
                          onChange={handleFormChange}
                          className="text-sm"
                        />
                      </div>
                    </div>

                    <div className="flex gap-2 justify-end">
                      <Button
                        variant="outline"
                        onClick={() => setEditMode(false)}
                        size="sm"
                      >
                        {t("common.cancel")}
                      </Button>
                      <Button
                        onClick={handleSaveProfile}
                        size="sm"
                        className="bg-black text-white hover:bg-black/90"
                      >
                        {t("common.save")}
                      </Button>
                    </div>
                  </div>
                )}

                {/* Edit Button */}
                {!editMode && (
                  <div className="flex justify-end">
                    <Button
                      onClick={() => setEditMode(true)}
                      size="sm"
                      className="bg-yellow-400 text-black hover:bg-yellow-500"
                    >
                      {t("editProfile")}
                    </Button>
                  </div>
                )}
              </div>
            </Card>
          </TabsContent>

          {/* Change Password Tab */}
          <TabsContent value="password" className="space-y-4">
            <Card className="p-4 md:p-6">
              <div className="space-y-4 max-w-md">
                <div className="space-y-2">
                  <Label htmlFor="currentPassword">
                    {t("currentPassword")}
                  </Label>
                  <Input
                    id="currentPassword"
                    name="currentPassword"
                    type="password"
                    value={passwordForm.currentPassword}
                    onChange={handlePasswordChange}
                    className="text-sm"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="newPassword">
                    {t("newPassword")}
                  </Label>
                  <Input
                    id="newPassword"
                    name="newPassword"
                    type="password"
                    value={passwordForm.newPassword}
                    onChange={handlePasswordChange}
                    className="text-sm"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="confirmNewPassword">
                    {t("confirmNewPassword")}
                  </Label>
                  <Input
                    id="confirmNewPassword"
                    name="confirmNewPassword"
                    type="password"
                    value={passwordForm.confirmPassword}
                    onChange={handlePasswordChange}
                    className="text-sm"
                  />
                </div>

                <div className="flex gap-2 justify-end pt-4">
                  <Button
                    variant="outline"
                    onClick={() =>
                      setPasswordForm({
                        currentPassword: "",
                        newPassword: "",
                        confirmPassword: "",
                      })
                    }
                    size="sm"
                  >
                    {t("common.cancel")}
                  </Button>
                  <Button
                    onClick={handleChangePassword}
                    size="sm"
                    className="bg-black text-white hover:bg-black/90"
                  >
                    {t("common.save")}
                  </Button>
                </div>
              </div>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}

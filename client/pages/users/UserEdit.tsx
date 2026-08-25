import { useState } from "react";
import { DashboardLayout } from "@/components/layouts/DashboardLayout";
import { UserForm } from "@/components/users/UserForm";
import { useUser } from "@/lib/hooks/queries/useUsers";
import { ArrowLeft, Loader2 } from "lucide-react";
import { Link, useParams, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useLocale } from "@/hooks/useLocale";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import { firebaseApi } from "@/lib/firebase/callable";
import { useQueryClient } from "@tanstack/react-query";

export default function UserEdit() {
  const { t } = useLocale(['users', 'common']);
  const { id } = useParams<{ id: string }>();
  const { data: user, isLoading, error } = useUser(id);
  const { toast } = useToast();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (data: any) => {
    if (!id) return;
    setIsSubmitting(true);
    try {
      const result = await firebaseApi.users.update({
        userId: id,
        email: data.email,
        fullName: data.fullName,
        phone: data.phone,
        role: data.role,
      });
      if (!result.success) {
        throw new Error(result.error || t('users.updateError'));
      }
      await queryClient.invalidateQueries({ queryKey: ['user', id] });
      await queryClient.invalidateQueries({ queryKey: ['users'] });
      toast({ title: t('users.userUpdated') });
      navigate('/users');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <DashboardLayout>
        <div className="p-6 md:p-8 flex items-center justify-center min-h-[400px]">
          <Loader2 className="h-8 w-8 animate-spin text-gray-600" aria-label={t("common.loading")} />
        </div>
      </DashboardLayout>
    );
  }

  if (error || !user) {
    return (
      <DashboardLayout>
        <div className="p-6 md:p-8 space-y-6 max-w-3xl mx-auto">
          <Button variant="ghost" size="sm" asChild data-testid="back-to-users">
            <Link to="/users">
              <ArrowLeft className="h-4 w-4 mr-2" aria-hidden="true" />
              {t("common.back")}
            </Link>
          </Button>
          <Alert variant="destructive">
            <AlertDescription>
              {error instanceof Error ? error.message : "User not found"}
            </AlertDescription>
          </Alert>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="p-6 md:p-8 space-y-6 max-w-3xl mx-auto">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" asChild data-testid="back-to-users">
            <Link to="/users">
              <ArrowLeft className="h-4 w-4 mr-2" aria-hidden="true" />
              {t("common.back")}
            </Link>
          </Button>
        </div>

        <UserForm
          mode="edit"
          initialData={user}
          onSubmit={handleSubmit}
          isLoading={isSubmitting}
        />
      </div>
    </DashboardLayout>
  );
}

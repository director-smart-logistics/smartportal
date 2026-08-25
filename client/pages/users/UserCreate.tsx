import { useState } from "react";
import { DashboardLayout } from "@/components/layouts/DashboardLayout";
import { UserForm } from "@/components/users/UserForm";
import { ArrowLeft } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useLocale } from "@/hooks/useLocale";
import { useToast } from "@/hooks/use-toast";
import { firebaseApi } from "@/lib/firebase/callable";
import { useQueryClient } from "@tanstack/react-query";

export default function UserCreate() {
  const { t } = useLocale(['users', 'common']);
  const { toast } = useToast();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (data: any) => {
    setIsSubmitting(true);
    try {
      const result = await firebaseApi.users.create({
        email: data.email,
        fullName: data.fullName,
        role: data.role,
        phone: data.phone,
      });
      if (!result.success) {
        throw new Error(result.error || t('users.createError'));
      }
      await queryClient.invalidateQueries({ queryKey: ['users'] });
      toast({ title: t('users.userCreated') });
      navigate('/users');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <DashboardLayout>
      <div className="p-6 md:p-8 space-y-6 max-w-3xl mx-auto">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="sm"
            asChild
            data-testid="back-to-users"
          >
            <Link to="/users">
              <ArrowLeft className="h-4 w-4 mr-2" aria-hidden="true" />
              {t("common.back")}
            </Link>
          </Button>
        </div>

        <UserForm
          mode="create"
          onSubmit={handleSubmit}
          isLoading={isSubmitting}
        />
      </div>
    </DashboardLayout>
  );
}

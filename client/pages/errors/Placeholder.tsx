import { useLocale } from "@/hooks/useLocale";
import { DashboardLayout } from "@/components/layouts/DashboardLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { ArrowLeft, Zap } from "lucide-react";

interface PlaceholderProps {
  title: string;
  description: string;
}

export function Placeholder({ title, description }: PlaceholderProps) {
  const { t } = useLocale('common');

  return (
    <DashboardLayout>
      <div className="p-6 md:p-8">
        <Link
          to="/dashboard"
          className="inline-flex items-center gap-2 text-primary hover:underline mb-8"
        >
          <ArrowLeft className="h-4 w-4" />
          {t("common.back")}
        </Link>

        <Card className="p-12 text-center">
          <div className="flex justify-center mb-6">
            <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center">
              <Zap className="h-8 w-8 text-primary" />
            </div>
          </div>
          <h1 className="text-3xl font-bold text-foreground mb-3">{title}</h1>
          <p className="text-muted-foreground max-w-md mx-auto mb-8">
            {description}
          </p>
          <div className="inline-block">
            <Button asChild>
              <a
                href="https://www.builder.io/c/docs/projects"
                target="_blank"
                rel="noopener noreferrer"
              >
                Continue building this page →
              </a>
            </Button>
          </div>
        </Card>
      </div>
    </DashboardLayout>
  );
}

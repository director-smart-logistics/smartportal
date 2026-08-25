import { Fragment } from "react";
import { Link, useLocation } from "react-router-dom";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { useLocale } from "@/hooks/useLocale";

export function AppBreadcrumb() {
  const location = useLocation();
  const { t } = useLocale(["breadcrumbs", "common"]);
  const pathnames = location.pathname.split("/").filter((x) => x);

  // Don't show breadcrumbs on dashboard or if empty
  if (
    pathnames.length === 0 ||
    (pathnames.length === 1 && pathnames[0] === "dashboard")
  ) {
    return null;
  }

  return (
    <Breadcrumb className="hidden lg:flex">
      <BreadcrumbList>
        <BreadcrumbItem>
          <BreadcrumbLink asChild>
            <Link to="/dashboard">{t("home")}</Link>
          </BreadcrumbLink>
        </BreadcrumbItem>
        {pathnames.map((value, index) => {
          const to = `/${pathnames.slice(0, index + 1).join("/")}`;
          const isLast = index === pathnames.length - 1;

          // Try to get translation from breadcrumbs namespace, fall back to formatted name
          const translatedName =
            t(value) !== value
              ? t(value)
              : value.charAt(0).toUpperCase() + value.slice(1);

          return (
            <Fragment key={to}>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                {isLast ? (
                  <BreadcrumbPage>{translatedName}</BreadcrumbPage>
                ) : (
                  <BreadcrumbLink asChild>
                    <Link to={to}>{translatedName}</Link>
                  </BreadcrumbLink>
                )}
              </BreadcrumbItem>
            </Fragment>
          );
        })}
      </BreadcrumbList>
    </Breadcrumb>
  );
}

'use client';

import * as React from 'react';
import { ChevronsUpDown, BellIcon, UserIcon, ChevronDownIcon } from 'lucide-react';
import {
  Breadcrumb,
  BreadcrumbEllipsis,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbSeparator,
} from '@repo/shadcn-ui/components/ui/breadcrumb';
import { Button } from '@repo/shadcn-ui/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@repo/shadcn-ui/components/ui/dropdown-menu';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@repo/shadcn-ui/components/ui/select';
import { Avatar, AvatarFallback, AvatarImage } from '@repo/shadcn-ui/components/ui/avatar';
import { Badge } from '@repo/shadcn-ui/components/ui/badge';
import { cn } from '@repo/shadcn-ui/lib/utils';

// Simple logo component for the navbar
const Logo = (props: React.SVGAttributes<SVGElement>) => {
  return (
    <svg width='1em' height='1em' viewBox='0 0 324 323' fill='currentColor' xmlns='http://www.w3.org/2000/svg' {...props}>
      <rect
        x='88.1023'
        y='144.792'
        width='151.802'
        height='36.5788'
        rx='18.2894'
        transform='rotate(-38.5799 88.1023 144.792)'
        fill='currentColor'
      />
      <rect
        x='85.3459'
        y='244.537'
        width='151.802'
        height='36.5788'
        rx='18.2894'
        transform='rotate(-38.5799 85.3459 244.537)'
        fill='currentColor'
      />
    </svg>
  );
};

// Notification Menu Component
const NotificationMenu = ({ 
  notificationCount = 3, 
  onItemClick 
}: { 
  notificationCount?: number;
  onItemClick?: (item: string) => void;
}) => (
  <DropdownMenu>
    <DropdownMenuTrigger asChild>
      <Button variant="ghost" size="icon" className="h-9 w-9 relative">
        <BellIcon className="h-4 w-4" />
        {notificationCount > 0 && (
          <Badge className="absolute -top-1 -right-1 h-5 w-5 flex items-center justify-center p-0 text-xs">
            {notificationCount > 9 ? '9+' : notificationCount}
          </Badge>
        )}
        <span className="sr-only">Notifications</span>
      </Button>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="end" className="w-80">
      <DropdownMenuLabel>Notifications</DropdownMenuLabel>
      <DropdownMenuSeparator />
      <DropdownMenuItem onClick={() => onItemClick?.('notification1')}>
        <div className="flex flex-col gap-1">
          <p className="text-sm font-medium">New message received</p>
          <p className="text-xs text-muted-foreground">2 minutes ago</p>
        </div>
      </DropdownMenuItem>
      <DropdownMenuItem onClick={() => onItemClick?.('notification2')}>
        <div className="flex flex-col gap-1">
          <p className="text-sm font-medium">System update available</p>
          <p className="text-xs text-muted-foreground">1 hour ago</p>
        </div>
      </DropdownMenuItem>
      <DropdownMenuItem onClick={() => onItemClick?.('notification3')}>
        <div className="flex flex-col gap-1">
          <p className="text-sm font-medium">Weekly report ready</p>
          <p className="text-xs text-muted-foreground">3 hours ago</p>
        </div>
      </DropdownMenuItem>
      <DropdownMenuSeparator />
      <DropdownMenuItem onClick={() => onItemClick?.('view-all')}>
        View all notifications
      </DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>
);

// User Menu Component
const UserMenu = ({
  userName = 'John Doe',
  userEmail = 'john@example.com',
  userAvatar,
  onItemClick
}: {
  userName?: string;
  userEmail?: string;
  userAvatar?: string;
  onItemClick?: (item: string) => void;
}) => (
  <DropdownMenu>
    <DropdownMenuTrigger asChild>
      <Button variant="ghost" className="h-9 px-2 py-0 hover:bg-accent hover:text-accent-foreground">
        <Avatar className="h-7 w-7">
          <AvatarImage src={userAvatar} alt={userName} />
          <AvatarFallback className="text-xs">
            {userName.split(' ').map(n => n[0]).join('')}
          </AvatarFallback>
        </Avatar>
        <ChevronDownIcon className="h-3 w-3 ml-1" />
        <span className="sr-only">User menu</span>
      </Button>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="end" className="w-56">
      <DropdownMenuLabel>
        <div className="flex flex-col space-y-1">
          <p className="text-sm font-medium leading-none">{userName}</p>
          <p className="text-xs leading-none text-muted-foreground">
            {userEmail}
          </p>
        </div>
      </DropdownMenuLabel>
      <DropdownMenuSeparator />
      <DropdownMenuItem onClick={() => onItemClick?.('profile')}>
        Profile
      </DropdownMenuItem>
      <DropdownMenuItem onClick={() => onItemClick?.('settings')}>
        Settings
      </DropdownMenuItem>
      <DropdownMenuItem onClick={() => onItemClick?.('billing')}>
        Billing
      </DropdownMenuItem>
      <DropdownMenuSeparator />
      <DropdownMenuItem onClick={() => onItemClick?.('logout')}>
        Log out
      </DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>
);

// Types
export interface Navbar07BreadcrumbItem {
  href?: string;
  label: string;
}

export interface Navbar07Project {
  value: string;
  label: string;
}

export interface Navbar07Props extends React.HTMLAttributes<HTMLElement> {
  logo?: React.ReactNode;
  logoHref?: string;
  breadcrumbItems?: Navbar07BreadcrumbItem[];
  projects?: Navbar07Project[];
  defaultProject?: string;
  userName?: string;
  userEmail?: string;
  userAvatar?: string;
  notificationCount?: number;
  onBreadcrumbClick?: (href: string) => void;
  onProjectChange?: (project: string) => void;
  onNotificationItemClick?: (item: string) => void;
  onUserItemClick?: (item: string) => void;
}

// Default breadcrumb items
const defaultBreadcrumbItems: Navbar07BreadcrumbItem[] = [
  { href: '#', label: 'Personal Account' },
  { href: '#', label: 'Projects' },
];

// Default projects
const defaultProjects: Navbar07Project[] = [
  { value: '1', label: 'Main project' },
  { value: '2', label: 'Origin project' },
];

export const Navbar07 = React.forwardRef<HTMLElement, Navbar07Props>(
  (
    {
      className,
      logo = <Logo />,
      logoHref = '#',
      breadcrumbItems = defaultBreadcrumbItems,
      projects = defaultProjects,
      defaultProject = '1',
      userName = 'John Doe',
      userEmail = 'john@example.com',
      userAvatar,
      notificationCount = 3,
      onBreadcrumbClick,
      onProjectChange,
      onNotificationItemClick,
      onUserItemClick,
      ...props
    },
    ref
  ) => {
    return (
      <header
        ref={ref}
        className={cn(
          'sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 px-4 md:px-6 [&_*]:no-underline',
          className
        )}
        {...props}
      >
        <div className="container mx-auto flex h-16 max-w-screen-2xl items-center justify-between gap-4">
          {/* Left side */}
          <div className="flex items-center gap-2">
            <Breadcrumb>
              <BreadcrumbList>
                <BreadcrumbItem>
                  <BreadcrumbLink 
                    href={logoHref} 
                    className="text-foreground"
                    onClick={(e) => {
                      e.preventDefault();
                      if (onBreadcrumbClick && logoHref) onBreadcrumbClick(logoHref);
                    }}
                  >
                    {logo}
                  </BreadcrumbLink>
                </BreadcrumbItem>
                <BreadcrumbSeparator> / </BreadcrumbSeparator>
                <BreadcrumbItem className="md:hidden">
                  <DropdownMenu>
                    <DropdownMenuTrigger className="hover:text-foreground">
                      <BreadcrumbEllipsis />
                      <span className="sr-only">Toggle menu</span>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start">
                      {breadcrumbItems.map((item, index) => (
                        <DropdownMenuItem key={index} asChild>
                          <button
                            onClick={(e) => {
                              e.preventDefault();
                              if (onBreadcrumbClick && item.href) onBreadcrumbClick(item.href);
                            }}
                            className="w-full text-left cursor-pointer"
                          >
                            {item.label}
                          </button>
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </BreadcrumbItem>
                {breadcrumbItems.map((item, index) => (
                  <React.Fragment key={index}>
                    <BreadcrumbItem className="max-md:hidden">
                      <BreadcrumbLink 
                        href={item.href}
                        onClick={(e) => {
                          e.preventDefault();
                          if (onBreadcrumbClick && item.href) onBreadcrumbClick(item.href);
                        }}
                      >
                        {item.label}
                      </BreadcrumbLink>
                    </BreadcrumbItem>
                    <BreadcrumbSeparator className="max-md:hidden"> / </BreadcrumbSeparator>
                  </React.Fragment>
                ))}
                <BreadcrumbItem>
                  <Select 
                    defaultValue={defaultProject}
                    onValueChange={onProjectChange}
                  >
                    <SelectTrigger className="focus-visible:bg-accent text-foreground h-8 px-1.5 focus-visible:ring-0 border-none shadow-none bg-transparent hover:bg-accent">
                      <SelectValue placeholder="Select project" />
                      <ChevronsUpDown
                        size={14}
                        className="text-muted-foreground/80 ml-1"
                      />
                    </SelectTrigger>
                    <SelectContent className="[&_*[role=option]]:ps-2 [&_*[role=option]]:pe-8 [&_*[role=option]>span]:start-auto [&_*[role=option]>span]:end-2">
                      {projects.map((project) => (
                        <SelectItem key={project.value} value={project.value}>
                          {project.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumb>
          </div>
          {/* Right side */}
          <div className="flex items-center gap-4">
            {/* Notification */}
            <NotificationMenu 
              notificationCount={notificationCount}
              onItemClick={onNotificationItemClick}
            />
            {/* User menu */}
            <UserMenu 
              userName={userName}
              userEmail={userEmail}
              userAvatar={userAvatar}
              onItemClick={onUserItemClick}
            />
          </div>
        </div>
      </header>
    );
  }
);

Navbar07.displayName = 'Navbar07';

export { Logo, NotificationMenu, UserMenu };
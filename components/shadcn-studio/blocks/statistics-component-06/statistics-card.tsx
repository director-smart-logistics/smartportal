import { EllipsisVerticalIcon } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { Progress } from '@/components/ui/progress'

import { cn } from '@/lib/utils'

const listItems = ['Share', 'Update', 'Refresh']

const StatisticsCard = ({ className }: { className?: string }) => {
  return (
    <Card className={cn('gap-6', className)}>
      <CardHeader className='flex w-full items-center justify-between'>
        <span className='text-xl font-medium'>Statistics</span>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant='ghost' size='icon' className='text-muted-foreground size-6 rounded-full'>
              <EllipsisVerticalIcon />
              <span className='sr-only'>Edit menu</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align='start'>
            <DropdownMenuGroup>
              {listItems.map((item, index) => (
                <DropdownMenuItem key={index}>{item}</DropdownMenuItem>
              ))}
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </CardHeader>
      <CardContent className='space-y-6'>
        <div className='space-y-3'>
          <div className='flex items-center justify-between'>
            <span className='font-semibold'>Order placed</span>
            <Badge className='bg-primary/10 text-primary rounded-sm'>+11</Badge>
          </div>
          <div className='space-y-2'>
            <div className='text-muted-foreground flex items-center justify-between text-sm'>
              <span>12 New orders</span>
              <span>85%</span>
            </div>
            <Progress value={85} />
          </div>
        </div>
        <div className='space-y-3'>
          <div className='flex items-center justify-between'>
            <span className='font-semibold'>Order Delivered</span>
            <Badge className='bg-primary/10 text-primary rounded-sm'>-4</Badge>
          </div>
          <div className='space-y-2'>
            <div className='text-muted-foreground flex items-center justify-between text-sm'>
              <span>8 New orders</span>
              <span>85%</span>
            </div>
            <Progress value={85} />
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

export default StatisticsCard

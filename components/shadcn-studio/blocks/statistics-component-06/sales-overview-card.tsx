import { PackageIcon, ShoppingCartIcon } from 'lucide-react'

import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Separator } from '@/components/ui/separator'

import { cn } from '@/lib/utils'

const SalesOverviewCard = ({ className }: { className?: string }) => {
  return (
    <Card className={cn('gap-6', className)}>
      <CardHeader className='flex flex-col gap-1'>
        <div className='flex w-full items-center justify-between gap-2'>
          <span className='text-muted-foreground'>Sales Overview</span>
          <span className='text-sm'>+18.2%</span>
        </div>
        <span className='text-2xl font-semibold'>$38.5k</span>
      </CardHeader>
      <CardContent className='space-y-6'>
        <div className='flex justify-between gap-1'>
          <div className='flex flex-1 flex-col gap-6'>
            <div className='flex items-center gap-2'>
              <div className='bg-primary/10 flex size-8 items-center justify-center rounded-md'>
                <ShoppingCartIcon className='text-primary size-4' />
              </div>
              <span>Order</span>
            </div>
            <div className='flex flex-col gap-2'>
              <span className='text-xl font-medium'>62.2%</span>
              <span className='text-muted-foreground text-sm'>6,440</span>
            </div>
          </div>
          <div className='flex flex-col items-center gap-1'>
            <Separator orientation='vertical' className='max-h-9.25' />
            <div className='bg-muted flex size-8 shrink-0 items-center justify-center rounded-full'>
              <span className='text-muted-foreground text-sm'>VS</span>
            </div>
            <Separator orientation='vertical' className='max-h-9.25' />
          </div>
          <div className='flex flex-1 flex-col gap-6'>
            <div className='flex items-center justify-end gap-2'>
              <span>Delivered</span>
              <div className='bg-primary/10 flex size-8 items-center justify-center rounded-md'>
                <PackageIcon className='text-primary size-4' />
              </div>
            </div>
            <div className='flex flex-col items-end gap-2'>
              <span className='text-xl font-medium'>25.5%</span>
              <span className='text-muted-foreground text-sm'>12,740</span>
            </div>
          </div>
        </div>
        <Progress value={60} />
      </CardContent>
    </Card>
  )
}

export default SalesOverviewCard

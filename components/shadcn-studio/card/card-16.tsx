'use client'

import { useEffect, ReactNode } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'

interface CardSpotlightProps {
  title: string
  description?: string
  icon?: ReactNode
  children: ReactNode
  glowColor?: string
  borderGlowColor?: string
  dataTestId?: string
  ariaLabel?: string
}

const CardSpotlight = ({ 
  title, 
  description, 
  icon, 
  children,
  glowColor = 'bg-primary/60 dark:bg-primary/40',
  borderGlowColor = 'shadow-primary/50',
  dataTestId,
  ariaLabel
}: CardSpotlightProps) => {
  useEffect(() => {
    const all = document.querySelectorAll('.spotlight-card')

    const handleMouseMove = (ev: MouseEvent) => {
      all.forEach(e => {
        const blob = e.querySelector('.blob') as HTMLElement
        const fblob = e.querySelector('.fake-blob') as HTMLElement

        if (!blob || !fblob) return

        const rec = fblob.getBoundingClientRect()

        blob.style.opacity = '1'

        blob.animate(
          [
            {
              transform: `translate(${
                ev.clientX - rec.left - rec.width / 2
              }px, ${ev.clientY - rec.top - rec.height / 2}px)`
            }
          ],
          {
            duration: 300,
            fill: 'forwards'
          }
        )
      })
    }

    window.addEventListener('mousemove', handleMouseMove)

    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
    }
  }, [])

  return (
    <div 
      className='h-full w-full' 
      data-testid={dataTestId}
      role="article"
      aria-label={ariaLabel || title}
    >
      <div 
        className='spotlight-card group bg-gradient-to-br from-border to-border/50 relative overflow-hidden rounded-xl p-px transition-all duration-500 ease-in-out h-full hover:shadow-[0_20px_50px_rgba(0,_0,_0,_0.7)] dark:hover:shadow-[0_20px_50px_rgba(0,_0,_0,_0.9)] hover:-translate-y-1 hover:scale-[1.02]'
      >
        <Card className='relative group-hover:bg-card/95 border-none transition-all duration-500 ease-in-out group-hover:backdrop-blur-sm h-full flex flex-col bg-card'>
          <CardHeader className='space-y-2'>
            {icon && (
              <div 
                className='mb-2 text-primary transition-transform duration-300 group-hover:scale-110'
                aria-hidden="true"
              >
                {icon}
              </div>
            )}
            <CardTitle 
              className='text-xl font-bold transition-colors duration-300 group-hover:text-primary'
              data-testid={dataTestId ? `${dataTestId}-title` : undefined}
            >
              {title}
            </CardTitle>
            {description && (
              <CardDescription 
                className='text-sm'
                data-testid={dataTestId ? `${dataTestId}-description` : undefined}
              >
                {description}
              </CardDescription>
            )}
          </CardHeader>
          <CardContent 
            className='flex-1'
            data-testid={dataTestId ? `${dataTestId}-content` : undefined}
          >
            {children}
          </CardContent>
        </Card>
        <div className={`blob pointer-events-none absolute top-0 left-0 size-32 rounded-full ${glowColor} opacity-0 blur-3xl transition-all duration-300 ease-in-out`} />
        <div className='fake-blob pointer-events-none absolute top-0 left-0 size-32 rounded-full' />
      </div>
    </div>
  )
}

export default CardSpotlight

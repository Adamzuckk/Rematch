import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { Link, type To } from 'react-router-dom'
import styles from './Button.module.css'

type ButtonVariant = 'primary' | 'secondary' | 'ghost'

interface SharedVisualProps {
  variant?: ButtonVariant
  iconOnly?: boolean
  className?: string
  children: ReactNode
}

type NativeButtonProps = SharedVisualProps &
  Omit<ButtonHTMLAttributes<HTMLButtonElement>, keyof SharedVisualProps> & {
    to?: never
  }

type LinkButtonProps = SharedVisualProps & {
  to: To
  'aria-label'?: string
}

export type ButtonProps = NativeButtonProps | LinkButtonProps

function buttonClassName(
  variant: ButtonVariant,
  iconOnly: boolean,
  className?: string,
) {
  return [
    styles.button,
    styles[variant],
    iconOnly ? styles.icon : '',
    className ?? '',
  ]
    .filter(Boolean)
    .join(' ')
}

export function Button({
  variant = 'secondary',
  iconOnly = false,
  className,
  children,
  ...rest
}: ButtonProps) {
  const classes = buttonClassName(variant, iconOnly, className)

  if ('to' in rest && rest.to !== undefined) {
    const { to, 'aria-label': ariaLabel } = rest
    return (
      <Link to={to} className={classes} aria-label={ariaLabel}>
        {children}
      </Link>
    )
  }

  const buttonRest = rest as Omit<
    NativeButtonProps,
    'variant' | 'iconOnly' | 'className' | 'children'
  >
  const { type = 'button', ...nativeRest } = buttonRest

  return (
    <button type={type} className={classes} {...nativeRest}>
      {children}
    </button>
  )
}

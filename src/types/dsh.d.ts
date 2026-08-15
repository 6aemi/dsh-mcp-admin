/**
 * Ambient type declarations for @deepseek-ai/* runtime & UI packages.
 * Enables zero-config IDE autocomplete and type-checking without hardcoded local paths.
 */

declare module '@deepseek-ai/cordis' {
  export interface Context {
    get(name: string): unknown
    logger: {
      warn(message: string, ...args: unknown[]): void
      info(message: string, ...args: unknown[]): void
      error(message: string, ...args: unknown[]): void
    }
    baseUrl?: string
    tools: {
      schemas(): Array<{ name: string; [key: string]: unknown }>
    }
    commands: {
      register(command: unknown): void
    }
    registry: {
      entries(): IterableIterator<[unknown, { name: string; fibers: Array<{ config?: unknown }> }]>
    }
    effect(fn: () => void, name?: string): void
    slots: {
      inject(name: string, fn: () => void): void
      register(descriptor: unknown, component: unknown): void
    }
    on(event: string, listener: (...args: unknown[]) => void): void
  }
}

declare module '@deepseek-ai/dsh-commands' {
  export interface CommandInvocation {
    rawInput: string
    [key: string]: unknown
  }

  export interface CommandResult {
    kind: 'success' | 'error'
    text: string
  }

  export interface CommandDefinition {
    name: string
    description?: string
    handler: (invocation: CommandInvocation) => Promise<CommandResult> | CommandResult
  }
}

declare module '@deepseek-ai/dsh-llm' {
  export interface ToolSchema {
    name: string
    description?: string
    parameters?: Record<string, unknown>
    [key: string]: unknown
  }
}

declare module '@deepseek-ai/dsh-typert-protocol' {
  import type { Context } from '@deepseek-ai/cordis'

  export function Remote(target: unknown, propertyKey: string, descriptor?: PropertyDescriptor): void

  export class TypertRemoteService {
    protected readonly ctx: Context
    protected readonly name: string
    constructor(ctx: Context, name: string)
  }

  export interface TypertCodec {
    mode: 'strict' | 'loose'
    typeSymbol: string
    schema: { _zod: true; parse: (v: unknown) => unknown }
  }

  export interface TypertRemoteContribution {
    package: string
    descriptors: Array<{
      id: string
      service: string
      namespace: string
      method: string
      invocation: { kind: 'direct' | 'stream' }
      parameters?: Array<{ name: string; wire: string; source: string; codec: TypertCodec }>
      result: TypertCodec
    }>
  }
}

declare module '@deepseek-ai/dsh-client-ui-primitives' {
  import type { ReactNode, ChangeEvent, MouseEvent } from 'react'

  export type StateDotState = 'done' | 'ongoing' | 'error' | 'warning'

  export interface ButtonProps {
    variant?: 'primary' | 'outline' | 'ghost' | 'secondary' | 'danger'
    size?: 'sm' | 'md' | 'lg'
    className?: string
    autoFocus?: boolean
    disabled?: boolean
    onClick?: (e: MouseEvent<HTMLButtonElement>) => void
    children?: ReactNode
  }
  export function Button(props: ButtonProps): JSX.Element

  export interface InputProps {
    value?: string
    placeholder?: string
    disabled?: boolean
    className?: string
    onChange?: (e: ChangeEvent<HTMLInputElement>) => void
  }
  export function Input(props: InputProps): JSX.Element

  export interface ModalProps {
    open: boolean
    onClose: () => void
    title?: ReactNode
    description?: ReactNode
    footer?: ReactNode
    children?: ReactNode
  }
  export function Modal(props: ModalProps): JSX.Element

  export interface PillProps {
    className?: string
    children?: ReactNode
  }
  export function Pill(props: PillProps): JSX.Element

  export interface StateDotProps {
    state: StateDotState
    className?: string
  }
  export function StateDot(props: StateDotProps): JSX.Element
}

declare module '@deepseek-ai/dsh-client-ui-slots' {
  export type InjectFace<T> = T
  export type PropsLocale<T extends string> = Record<string, unknown>
  export type PropsRuntime<T extends string> = Record<string, unknown>
}

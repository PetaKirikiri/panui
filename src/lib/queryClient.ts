import { QueryClient } from '@tanstack/react-query'

/** Shared instance for provider + imperative invalidation from lib code (e.g. after word_registry writes). */
export const queryClient = new QueryClient()

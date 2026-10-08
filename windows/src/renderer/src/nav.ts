import { create } from 'zustand'

export type Page = 'overview' | 'holdings' | 'cash' | 'spending' | 'goals' | 'history' | 'settings'

export const useNav = create<{ page: Page; go: (p: Page) => void }>((set) => ({
  page: 'overview',
  go: (page) => {
    set({ page })
    document.querySelector('.main')?.scrollTo({ top: 0 })
  }
}))

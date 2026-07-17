import { FC, createContext, useContext, ReactNode } from "react"
import { DiskStorageService, StorageService } from "@/services/StorageService"

const StorageContext = createContext<StorageService | undefined>(undefined)

interface StorageProviderProps {
  children: ReactNode
  implementation?: StorageService
}

export const StorageProvider: FC<StorageProviderProps> = ({ children, implementation }) => {
  const storage = implementation ?? new DiskStorageService()
  return <StorageContext.Provider value={storage}>{children}</StorageContext.Provider>
}

export const useStorage = (): StorageService => {
  const ctx = useContext(StorageContext)
  if (!ctx) throw new Error("useStorage must be used within a StorageProvider")
  return ctx
}

import { v4 as uuidv4 } from "uuid"
import { HistoryItem, HistoryItemMetadata } from "@/types"
import { MySettings } from "@/context/SettingsContext"
import { QRCodeData, PassportViewModel } from "@zkpassport/utils"
import { CriteriaItem } from "@/components/AccessRequest"
import { getDocumentType, getIssuingCountryCode } from "@/lib/credentials"

export interface CreateHistoryItemParams {
  passportId: string
  passport: PassportViewModel
  credentialsRequest: QRCodeData
  accessItems: CriteriaItem[]
}

export interface HistoryServiceContext {
  settings: MySettings
  updateSettings: (newSettings: Partial<MySettings>) => Promise<void>
}

export class HistoryService {
  /**
   * Get all history items
   */
  static getAll(settings: MySettings): HistoryItem[] {
    return settings.history || []
  }

  /**
   * Get a history item by ID
   */
  static getById(settings: MySettings, id: string): HistoryItem | undefined {
    const history = HistoryService.getAll(settings)
    return history.find((item) => item.id === id)
  }

  /**
   * Get history items filtered by passport IDs
   */
  static getByPassportIds(settings: MySettings, passportIds: string[]): HistoryItem[] {
    if (passportIds.length === 0) {
      return HistoryService.getAll(settings)
    }
    const history = HistoryService.getAll(settings)
    return history.filter((item) => passportIds.includes(item.passportId))
  }

  /**
   * Get history items for a specific passport
   */
  static getByPassportId(settings: MySettings, passportId: string): HistoryItem[] {
    const history = HistoryService.getAll(settings)
    return history.filter((item) => item.passportId === passportId)
  }

  /**
   * Create a history item object
   */
  static createHistoryItem(params: CreateHistoryItemParams): HistoryItem {
    const { passportId, passport, credentialsRequest, accessItems } = params

    const metadata: HistoryItemMetadata = {
      countryCode: getIssuingCountryCode(passport),
      idType: getDocumentType(passport.mrz, getIssuingCountryCode(passport), passport.nationality),
      timestamp: new Date().toISOString(),
      name: passport.name,
      accessItems,
    }

    return {
      id: uuidv4(),
      passportId,
      metadata,
      request: credentialsRequest,
    }
  }

  /**
   * Add a new history item
   */
  static async addItem(
    context: HistoryServiceContext,
    params: CreateHistoryItemParams,
  ): Promise<HistoryItem> {
    const historyItem = HistoryService.createHistoryItem(params)
    const currentHistory = HistoryService.getAll(context.settings)

    await context.updateSettings({
      history: [...currentHistory, historyItem],
    })

    return historyItem
  }

  /**
   * Delete a history item
   */
  static async deleteItem(context: HistoryServiceContext, id: string): Promise<HistoryItem[]> {
    const currentHistory = HistoryService.getAll(context.settings)
    const newHistory = currentHistory.filter((item) => item.id !== id)
    await context.updateSettings({ history: newHistory })

    return newHistory
  }

  /**
   * Passport info extracted from history metadata
   */
  static getUniquePassportIdsFromHistory(
    settings: MySettings,
  ): Map<string, { name: string; countryCode: string; idType: string }> {
    const history = HistoryService.getAll(settings)
    const passportInfoMap = new Map<string, { name: string; countryCode: string; idType: string }>()

    for (const item of history) {
      // Only add if we haven't seen this passportId yet
      if (!passportInfoMap.has(item.passportId)) {
        passportInfoMap.set(item.passportId, {
          name: item.metadata.name,
          countryCode: item.metadata.countryCode,
          idType: item.metadata.idType,
        })
      }
    }

    return passportInfoMap
  }
}

export default HistoryService

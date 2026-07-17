import React, { createContext, useContext, useState, useEffect, useMemo, useRef } from "react"
import AsyncStorage from "@react-native-async-storage/async-storage"
import type { PassportViewModel, ProofResult } from "@zkpassport/utils"
import { createOperationTimer } from "@/services/TimingService"
import { Alert, AppState, AppStateStatus, InteractionManager, Platform } from "react-native"
import { Binary } from "@zkpassport/utils"
import {
  getRandomBytesHex,
  isMeetingMinVersion,
  sendAnonymousMetadata,
  checkRAMAndWarnUser,
  getPassportUniqueId,
  deriveSecretFromMasterKey,
} from "@/lib"
import { v4 as uuidv4 } from "uuid"
import * as FileSystem from "expo-file-system"
import { getCscaForPassportAsync } from "@zkpassport/utils"
import { isIDSupported } from "@zkpassport/utils"
import { checkDuplicateProofs, checkManifestVersion } from "@/lib/circuit-matcher"
import { decrypt, decryptBuffer, encrypt, sha256Truncate } from "@/lib/encryption"
import { useTranslation } from "react-i18next"
import { sha256 } from "@noble/hashes/sha2.js"
import { bytesToHex } from "@noble/hashes/utils.js"
import { PASSPORTS } from "@/assets/mock-data/passport"
import { RegistryClient } from "@zkpassport/registry"
import { shouldAutoReportError, UnsupportedPassportEnum } from "@/lib/errorUtils"
import {
  ZKPassportError,
  ErrorType,
  MissingCscaError,
  UnsupportedPassportError,
  CertificateModalState,
  ErrorLog,
} from "@/types/Error"
import { createBaseSubproofError, createUnsupportedPassportError } from "@/lib/errorUtils"
import {
  convertToPassportViewModel,
  defaultSettings,
  deleteFromSecureStorage,
  saveToSecureStorage,
  getValueFromSecureStorage,
} from "@/lib/settingsUtils"
import { useError } from "@/context/ErrorContext"
// import { UnsupportedPassportModal } from "@/components/Modals"
import { validatePassportData } from "@/lib/utils/sodUtils"
import { useStorage } from "./StorageContext"
import { BaseProofService } from "@/services/ProofService"
import { reportEvent } from "@/services/EventReportingService"
import { baseSubproofNameToStep } from "@/lib/proofSteps"
import { HistoryItem } from "@/types"
import { MASTER_KEY_DERIVATION_IDS } from "@/lib/constants"
import { AlertModal } from "@/components/Modals"

const MIN_PASSPORT_DATA_STRUCTURE_SUPPORTED_APP_VERSION = "0.6.3"
const ALL_PASSPORTS_KEYCHAIN_SERVICE = "allPassports"
const MASTER_KEY_KEYCHAIN_SERVICE = "zkpassport_master_key"

// Add a constant for the file path
const PASSPORTS_FILE_PATH = FileSystem.documentDirectory + "zkpassport_passports.enc"

// Define types
export type SavedPassport = {
  id: string
}

export type MySettings = {
  userUuid?: string
  activePassport?: string
  unsupportedIds?: string[]
  passports: SavedPassport[]
  showResetDataButton: boolean
  fullProofMode: boolean
  faceMatchDebug?: boolean
  generatingBaseSubproofs: boolean
  circuitBeingProven: string
  startedGeneratingBaseSubproofsAt: number
  baseSubproofs: { [key: string]: ProofResult[] }
  cleanExitDuringProofGeneration: boolean
  memoryTooLow: boolean
  hideIDDetails: boolean
  hasSeenBiometricCheck: boolean
  hasAddedIdBefore: boolean
  currentProofGenerationProgress?: ProofGenerationEvent
  history: HistoryItem[]
  requireAuthForVerification: boolean
}

export type ProofGenerationEvent = {
  circuitName: string
  circuitSize?: number
  stage: "start" | "complete"
  proofIndex: number
  totalProofs: number
}

export type SettingsContextType = {
  settings: MySettings
  updateSettings: (newSettings: Partial<MySettings>) => Promise<void>
  deleteSettingsKeys: (keysToDelete: string[]) => Promise<void>
  resetSettings: () => Promise<void>
  loadPassports: () => Promise<void>
  passports: Record<string, PassportViewModel>
  savePassport: (
    passportData: PassportViewModel,
    isUnsupported?: boolean,
    _masterKey?: string,
  ) => Promise<void>
  saveMockPassports: () => Promise<void>
  deletePassport: (id: string) => Promise<void>
  deleteAllPassports: () => Promise<void>
  getPassportFromId: (passportId: string) => PassportViewModel | undefined
  getPassportIdFromNumber: (passportNumber: string) => string | undefined
  currentPassport: PassportViewModel | null
  getCommitmentSalt: () => Promise<string>
  failedToLoadPassport: boolean
  passportsLoaded: boolean
  getMrzs: () => Promise<string[]>
  addUnsupportedId: (id: string) => void
  checkUnsupportedId: (id: string) => boolean
  getBaseSubproofs: (
    id: string,
    passport: PassportViewModel,
    devMode?: boolean,
    forceLowMemoryProver?: boolean,
  ) => Promise<ProofResult[] | undefined>
  canGenerateProofs: () => boolean
  clearBaseProofs: () => Promise<void>
  onProofGenerationEvent?: (event: ProofGenerationEvent) => void
  setProofGenerationEventListener: (listener: (event: ProofGenerationEvent) => void) => void
  getOrCreateUuid: () => Promise<string>
  showCSCANotFoundModal: boolean
  setShowCSCANotFoundModal: (show: boolean) => void
  showUnsupportedPassportModal: boolean
  setShowUnsupportedPassportModal: (show: boolean) => void
  getMasterKey: () => Promise<string | null>
  isDevModeEnabled: boolean
  toggleDevMode: () => Promise<void>
}

// Create context
const SettingsContext = createContext<SettingsContextType | undefined>(undefined)

// Provider component
export const SettingsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [settings, setSettings] = useState<MySettings>(defaultSettings)
  const [passports, setPassports] = useState<Record<string, PassportViewModel>>({})
  // Use a ref to store the master key in memory to ensure that always the latest
  // value is read to prevent unnecessary read to the keychain
  const masterKeyRef = useRef<string | undefined>(undefined)
  const [failedToLoadPassport, setFailedToLoadPassport] = useState(false)
  const [passportsLoaded, setPassportsLoaded] = useState(false)
  const [proofGenerationEventListener, setProofGenerationEventListener] = useState<
    ((event: ProofGenerationEvent) => void) | undefined
  >(undefined)
  const [queuedEvents, setQueuedEvents] = useState<ProofGenerationEvent[]>([])
  const { t } = useTranslation()
  const { reportError, hasErrorReportingConsent, sendErrorToAPI } = useError()
  const storage = useStorage()

  // Simplified modal states
  const [cscaModal, setCSCAModal] = useState<CertificateModalState>({
    visible: false,
    error: null,
    autoReported: false,
  })

  const [unsupportedModal, setUnsupportedModal] = useState<CertificateModalState>({
    visible: false,
    error: null,
    autoReported: false,
  })

  // Shared state for current passport being processed for errors
  const [currentPassportForError, setCurrentPassportForError] = useState<PassportViewModel | null>(
    null,
  )

  const isDevModeEnabled = useMemo(() => {
    try {
      if (!settings.passports || settings.passports.length === 0) {
        return false
      }
      const mockPassports = Object.keys(PASSPORTS).map((x) => PASSPORTS[x])
      const mockPassportIds = mockPassports.map((passport) => getPassportUniqueId(passport))
      // Find if there are any mock passports
      return mockPassportIds.some((id) => settings.passports.some((p) => p.id === id))
    } catch (error) {
      console.error("Error checking if dev mode is enabled: " + error)
      return false
    }
  }, [settings.passports])

  const toggleDevMode = async () => {
    if (isDevModeEnabled) {
      await deleteMockPassports()
    } else {
      await saveMockPassports()
    }
  }

  /**
   * Get the master key from the keychain or generate a new one if it doesn't exist
   * @returns The master key as a hex string
   */
  const getMasterKey = async () => {
    // If the master key is already available in memory, return it
    if (masterKeyRef.current) {
      return masterKeyRef.current
    }
    // Otherwise, get it from the keychain
    try {
      // Make this throw an error if it fails to get the master key
      // so we can tell whether the biometric check failed or if the user just doesn't have
      // a master key yet
      const masterKeyFromStorage = await getValueFromSecureStorage(
        MASTER_KEY_KEYCHAIN_SERVICE,
        true,
      )
      if (!masterKeyFromStorage) {
        // If it doesn't exist, generate a new one and save it to the keychain
        const newMasterKey = getRandomBytesHex(64)
        // Save the new master key to the keychain
        await saveToSecureStorage(MASTER_KEY_KEYCHAIN_SERVICE, newMasterKey, true)
        // Set the master key in memory and return it
        masterKeyRef.current = newMasterKey
        return newMasterKey
      }
      // Otherwise, set the master key in memory and return it
      masterKeyRef.current = masterKeyFromStorage
      return masterKeyFromStorage
    } catch (error) {
      console.log("Error getting master key: " + error)
      return null
    }
  }

  // Simplified helper functions
  const showCSCAModal = (
    error: MissingCscaError,
    passport: PassportViewModel,
    autoReported: boolean,
  ) => {
    setCurrentPassportForError(passport)
    setCSCAModal({
      visible: true,
      error,
      autoReported,
    })
  }

  const showUnsupportedModal = (
    error: UnsupportedPassportError,
    passport: PassportViewModel,
    autoReported: boolean,
  ) => {
    setCurrentPassportForError(passport)
    setUnsupportedModal({
      visible: true,
      error,
      autoReported,
    })
  }

  // TODO: This needs to be improved, a structure that makes it easy to query the registry to see if an ID is supported or not
  const addUnsupportedId = (id: string) => {
    setSettings((prev) => ({ ...prev, unsupportedIds: [...(prev.unsupportedIds ?? []), id] }))
  }

  const getPassportIdFromNumber = (passportNumber: string) =>
    settings.passports.find((p) => passports[p.id]?.passportNumber === passportNumber)?.id

  const checkUnsupportedId = (id: string) => {
    return settings.unsupportedIds?.includes(id) ?? false
  }

  const resetCSCAModal = () => {
    setCSCAModal({ visible: false, error: null, autoReported: false })
    setCurrentPassportForError(null)
  }

  const resetUnsupportedModal = () => {
    setUnsupportedModal({ visible: false, error: null, autoReported: false })
    setCurrentPassportForError(null)
  }

  const currentPassport = useMemo(
    () =>
      settings.activePassport && passports[settings.activePassport]
        ? passports[settings.activePassport]
        : null,
    [settings.activePassport, passports],
  )

  useEffect(() => {
    loadPassports().finally(() => setPassportsLoaded(true))
    AppState.addEventListener("change", async (state: AppStateStatus) => {
      // Lifecycle events don't work properly on Android, so we don't use them
      if (Platform.OS === "android") {
        return
      }
      const storedSettings = await storage.getItem("settings")
      if (storedSettings) {
        const parsedSettings = JSON.parse(storedSettings)
        if (state === "background" && parsedSettings.generatingBaseSubproofs) {
          console.log("Going in background")
          updateSettings({
            // Mark as clean exit if going to background while generating proofs
            cleanExitDuringProofGeneration: true,
          })
        } else if (state === "active" && parsedSettings.generatingBaseSubproofs) {
          console.log("Resuming from background")
          updateSettings({
            cleanExitDuringProofGeneration: false,
          })
          // TODO: Look into fixing this
          /*
          .then(async () => {
            if (actualCurrentPassport && parsedSettings.activePassport) {
              try {
                await getBaseSubproofs(parsedSettings.activePassport, actualCurrentPassport)
              } catch (error) {
                console.error("Error generating base subproofs: " + getErrorMessage(error))
              }
            }
          })*/
        }
      }
    })
  }, [])

  const loadSettings = async () => {
    try {
      const storedSettings = await storage.getItem("settings")
      if (storedSettings) {
        console.log("Loading existing settings from storage")
        const parsedSettings = JSON.parse(storedSettings)
        // If the active passport is not set, set it to the first passport
        if (!parsedSettings.activePassport && settings.passports && settings.passports.length > 0) {
          parsedSettings.activePassport = settings.passports[0].id
        }
        // If the active passport points to a passport that doesn't exist, set it to the first passport
        if (
          parsedSettings.activePassport &&
          settings.passports &&
          settings.passports.length > 0 &&
          !settings.passports.some((p) => p.id === parsedSettings.activePassport)
        ) {
          console.log(
            "Active passport points to a passport that doesn't exist, setting it to the first passport",
          )
          parsedSettings.activePassport = settings.passports[0].id
        }
        // Always ensure UUID exists, either from settings or by creating new
        const uuid = parsedSettings.userUuid || (await getOrCreateUuid())
        const hasAddedIdBefore =
          typeof parsedSettings.hasAddedIdBefore === "boolean"
            ? parsedSettings.hasAddedIdBefore
            : Array.isArray(parsedSettings.passports) && parsedSettings.passports.length > 0
        const settingsWithUuid = {
          ...defaultSettings,
          ...parsedSettings,
          hasAddedIdBefore,
          userUuid: uuid,
        }
        setSettings(settingsWithUuid)
        return settingsWithUuid
      } else {
        console.log("First time app launch. Generating new UUID and setting default settings")
        // First time app launch - generate UUID and set default settings
        const uuid = await getOrCreateUuid()
        const initialSettings = { ...defaultSettings, userUuid: uuid }
        setSettings(initialSettings)
        return initialSettings
      }
    } catch (error) {
      console.error("Error loading settings: " + error)
      // Even on error, ensure we have a UUID, maybe overkill
      const uuid = await getOrCreateUuid()
      const fallbackSettings = { ...defaultSettings, userUuid: uuid }
      setSettings(fallbackSettings)
      return fallbackSettings
    }
  }

  const updateSettings = async (newSettings: Partial<MySettings>) => {
    await storage.mergeItem("settings", newSettings)
    try {
      const storedSettings = await storage.getItem("settings")
      if (storedSettings) {
        const parsedSettings = JSON.parse(storedSettings)
        setSettings(parsedSettings as MySettings)
      }
    } catch (error) {
      console.warn("Error persisting settings", error)
    }
  }

  // Helper function to explicitly delete specific keys
  const deleteSettingsKeys = async (keysToDelete: string[]) => {
    await storage.mergeItem(
      "settings",
      {},
      {
        deleteKeys: keysToDelete,
      },
    )
    try {
      const storedSettings = await storage.getItem("settings")
      if (storedSettings) {
        const parsedSettings = JSON.parse(storedSettings)
        setSettings(parsedSettings as MySettings)
      }
    } catch (error) {
      console.warn("Error deleting settings keys", error)
    }
  }

  // Helper function to emit proof generation events
  const emitProofGenerationEvent = (event: ProofGenerationEvent) => {
    // Always update the current progress in settings
    updateSettings({ currentProofGenerationProgress: event })

    if (proofGenerationEventListener) {
      proofGenerationEventListener(event)
    } else {
      // Queue the event if no listener is set
      setQueuedEvents((prev) => [...prev, event])
    }
  }

  const resetSettings = async () => {
    if (Platform.OS === "ios") {
      // TODO: remove this later as this should be removed during the migration
      // done in getAllPassportsData
      await deleteFromSecureStorage(ALL_PASSPORTS_KEYCHAIN_SERVICE)

      const fileExists = await FileSystem.getInfoAsync(PASSPORTS_FILE_PATH)
      if (fileExists.exists) {
        await FileSystem.deleteAsync(PASSPORTS_FILE_PATH)
      }
      // Remove any potential legacy passport keys from the keychain
      try {
        for (const pass of settings.passports) {
          await deleteFromSecureStorage(`passport${pass.id}`)
        }
      } catch (error) {
        console.error("Error resetting IDs: " + error)
      }
    } else {
      // For Android, delete the file if it exists
      try {
        const fileExists = await FileSystem.getInfoAsync(PASSPORTS_FILE_PATH)
        if (fileExists.exists) {
          await FileSystem.deleteAsync(PASSPORTS_FILE_PATH)
        }

        await deleteFromSecureStorage(`${ALL_PASSPORTS_KEYCHAIN_SERVICE}Key`)

        // Remove any potential legacy passport keys from the keychain
        for (const pass of settings.passports) {
          await deleteFromSecureStorage(`passport${pass.id}Key`)
          await AsyncStorage.removeItem(`passport${pass.id}`)
        }
      } catch (error) {
        console.error("Error resetting IDs: " + error)
      }
    }

    // Preserve the UUID when resetting settings
    const currentUuid = settings.userUuid
    const hasAddedIdBefore = settings.hasAddedIdBefore
    setSettings({ ...defaultSettings, userUuid: currentUuid, hasAddedIdBefore: hasAddedIdBefore })

    try {
      await AsyncStorage.setItem(
        "settings",
        JSON.stringify({ ...defaultSettings, userUuid: currentUuid }),
      )
    } catch (error) {
      console.error("Error resetting settings: " + error)
    }
  }

  const deletePassport = async (id: string) => {
    setPassports((prev) => {
      const newPassports = { ...prev }
      delete newPassports[id]
      return newPassports
    })
    const passportsWithoutDeletedOne = settings.passports.filter((p) => p.id !== id)
    const newActivePassport =
      settings.activePassport === id && passportsWithoutDeletedOne.length > 0
        ? passportsWithoutDeletedOne[0].id
        : passportsWithoutDeletedOne.length > 0
          ? settings.activePassport
          : undefined

    // Get existing passports from keychain
    const allPassportsData = await getAllPassportsData()

    // Remove the passport from the dictionary
    if (allPassportsData && allPassportsData[id]) {
      delete allPassportsData[id]

      // Save updated passports dictionary back to keychain
      await saveAllPassportsData(allPassportsData)
    }

    // TODO: Do we remove the history associated with the ID aswell?

    await updateSettings({
      passports: passportsWithoutDeletedOne,
      activePassport: newActivePassport,
      baseSubproofs: {
        [id]: [],
      },
      generatingBaseSubproofs: false,
      startedGeneratingBaseSubproofsAt: 0,
      hasSeenBiometricCheck: !!allPassportsData && Object.keys(allPassportsData).length > 0,
    })
  }

  const deleteMultiplePassports = async (ids: string[]) => {
    setPassports((prev) => {
      const newPassports = { ...prev }
      for (const id of ids) {
        delete newPassports[id]
      }
      return newPassports
    })
    const passportsWithoutDeletedOnes = settings.passports.filter((p) => !ids.includes(p.id))

    // Get existing passports from keychain
    const allPassportsData = await getAllPassportsData()
    for (const id of ids) {
      if (allPassportsData && allPassportsData[id]) {
        delete allPassportsData[id]
      }
    }

    // Save updated passports dictionary back to keychain
    await saveAllPassportsData(allPassportsData || {})

    // Update settings
    await updateSettings({
      passports: passportsWithoutDeletedOnes,
      activePassport:
        passportsWithoutDeletedOnes.length > 0 ? passportsWithoutDeletedOnes[0].id : undefined,
    })
  }

  const deleteAllPassports = async () => {
    setPassports({})
    const newActivePassport = undefined

    // Get existing passports from keychain
    const allPassportsData = await getAllPassportsData()

    // Remove the passport from the dictionary
    if (allPassportsData) {
      await saveAllPassportsData({})
    }

    await updateSettings({
      passports: [],
      activePassport: newActivePassport,
      baseSubproofs: undefined,
      generatingBaseSubproofs: false,
      startedGeneratingBaseSubproofsAt: 0,
      hasSeenBiometricCheck: false,
    })
  }

  const deleteMockPassports = async () => {
    const mockPassports = Object.keys(PASSPORTS).map((x) => PASSPORTS[x])
    const mockPassportIds = mockPassports.map((passport) => getPassportUniqueId(passport))
    await deleteMultiplePassports(mockPassportIds)
  }

  const saveMockPassports = async () => {
    const mockPassports = Object.keys(PASSPORTS).map((x) => PASSPORTS[x])

    // Get current passports data
    const allPassportsData = (await getAllPassportsData()) || {}

    for (const passport of mockPassports) {
      try {
        // Generate a deterministic ID from the passport data
        const id = bytesToHex(sha256(passport.sod.signerInfo.signature.toUInt8Array()))

        // Add new passport to dictionary
        allPassportsData[id] = passport
      } catch (error) {
        console.error("Error saving ID data: " + error)
      }
    }

    // Save mock passports dictionary
    await saveAllPassportsData(allPassportsData)

    // Set the first mock passport as the active passport
    const firstMockPassportId = getPassportUniqueId(mockPassports[0])

    await updateSettings({
      activePassport: firstMockPassportId,
      passports: Object.keys(allPassportsData).map((id) => ({ id })),
      hasAddedIdBefore: true,
    })
    setPassports(allPassportsData)

    console.log("Mock passports saved")
    // TODO: Look into fixing this
    /*
    InteractionManager.runAfterInteractions(async () => {
      console.log("Base subproofs generation started")
      try {
        await getBaseSubproofs(
          Object.keys(allPassportsData)[0],
          allPassportsData[Object.keys(allPassportsData)[0]],
        )
      } catch (error) {
        console.error("Error generating base subproofs:", error)
        Alert.alert(t("errors.proofGenerationError"), getErrorMessage(error))
      }
      console.log("Base subproofs generation finished")
    })*/
  }

  const loadPassports = async () => {
    const storedSettings: MySettings = await loadSettings()
    setFailedToLoadPassport(false)
    if (passports && Object.keys(passports).length > 0) {
      console.log("Already loaded passports, skipping")
      return
    }
    if (storedSettings && storedSettings.passports && storedSettings.passports.length > 0) {
      try {
        // Pass it the storedSettings fetched above to make sure to have the latest settings
        // available, otherwise on cold start, there may be empty while they shouldn't
        const allPassportsData = await getAllPassportsData(storedSettings)
        if (!allPassportsData || Object.keys(allPassportsData).length === 0) {
          return
        }

        const _passports: Record<string, PassportViewModel> = {}
        // TODO: Look into fixing this
        /*
        if (storedSettings.passports.length !== Object.keys(allPassportsData).length) {
          // If the number of passports in the settings is different from the number of passports in the keychain,
          // then we need to reset the settings
          await resetSettings()
          return
        }*/
        for (const pass of storedSettings.passports) {
          const passportData = allPassportsData[pass.id]
          if (passportData) {
            // Convert serialized passport data to PassportViewModel
            const passport = convertToPassportViewModel(passportData)

            // Remove passports that are not from the minimum supported app version
            // to avoid incompatibility issues
            if (
              !isMeetingMinVersion(
                passport.appVersion,
                MIN_PASSPORT_DATA_STRUCTURE_SUPPORTED_APP_VERSION,
              )
            ) {
              console.log("Passport is not from minimum supported version, deleting")
              // Reset the settings
              await resetSettings()
              break
            }
            if (passport.nationality === "ZKR") {
              // Old mock passports had a DG2 hash that was all zeros
              // which is no longer supported by the circuit, it must be non-zeroed
              // So we delete them and let the user load the new ones
              const containsOnlyZeros = passport.dataGroups
                .find((x) => x.groupNumber === 2)
                ?.hash?.every((x) => x === 0)
              if (containsOnlyZeros) {
                console.log("Old unsupported ZKR passport, deleting")
                // Reset the settings
                await resetSettings()
                Alert.alert(
                  t("errors.oldUnsupportedZKRPassport"),
                  t("errors.oldUnsupportedZKRPassportDescription"),
                )
                break
              }
            }
            _passports[pass.id] = passport
          } else {
            setFailedToLoadPassport(true)
          }
        }
        setPassports(_passports)
        if (Object.keys(_passports).length > 0 && !settings.hasAddedIdBefore) {
          await updateSettings({ hasAddedIdBefore: true })
        }
        if (
          !!storedSettings.circuitBeingProven &&
          !storedSettings.cleanExitDuringProofGeneration &&
          _passports &&
          storedSettings.activePassport
        ) {
          const actualCurrentPassport = _passports[storedSettings.activePassport]
          if (actualCurrentPassport) {
            console.error(
              "The app quit unexpectedly during the generation of the proofs. Failed with this circuit: " +
                storedSettings.circuitBeingProven,
            )
            const reportMetadata = await shouldAutoReportError(hasErrorReportingConsent)
            if (reportMetadata) {
              const client = new RegistryClient({
                chainId: 11155111,
              })
              const { certificates } = await client.getCertificates(undefined, {
                validate: false,
              })
              const csc = await getCscaForPassportAsync(
                actualCurrentPassport.sod.certificate,
                certificates,
              )
              await sendAnonymousMetadata(
                actualCurrentPassport,
                csc ?? undefined,
                true,
                settings.memoryTooLow,
              )
            }
            // Clear the base proofs so user can start over
            await clearBaseProofs()
          }
        }
      } catch (error: any) {
        console.log("Error loading IDs: " + error)
        setFailedToLoadPassport(true)
      }
    }
  }

  const getCommitmentSalt = async () => {
    const masterKey = await getMasterKey()
    if (!masterKey) {
      // Better to throw here, cause it shouldn't be possible to get here
      // as when this function is called, the master key should always be in memory
      // so there's no case of failing authentication at this point
      throw new Error("No master key found")
    }
    const salt = await deriveSecretFromMasterKey(
      masterKey,
      MASTER_KEY_DERIVATION_IDS.commitment_salt,
      31,
    )
    return `0x${salt}`
  }

  // New helper function to get all passports data from Keychain
  const getAllPassportsData = async (
    _settings?: MySettings,
    _masterKey?: string,
  ): Promise<Record<string, PassportViewModel> | null> => {
    try {
      const storedSettings = _settings ?? settings
      // If passports have already been loaded from the keychain,
      // we can skip pinging the keychain and return what we have already
      if (passports && Object.keys(passports).length) {
        return passports
      }

      if (!storedSettings.passports || storedSettings.passports.length === 0) {
        // If no passport listed in the setting DEVICE_PASSCODE, then skip
        // the rest and return an empty object straightaway
        return {}
      }

      // Get the encryption key and nonce from the master key
      const masterKey = _masterKey ?? (await getMasterKey())
      if (!masterKey) {
        console.log("No master key found, returning empty object")
        // The authentication failed, so just return an empty object
        // and let the user try again
        setFailedToLoadPassport(true)
        return {}
      }
      const encryptionKey = await deriveSecretFromMasterKey(
        masterKey,
        MASTER_KEY_DERIVATION_IDS.id_data_encryption_key,
        32,
      )
      const nonce = getRandomBytesHex(12)

      // Check if file exists
      const fileExists = await FileSystem.getInfoAsync(PASSPORTS_FILE_PATH)
      // TODO: merge the logic below once we can drop the migration step
      // in a future version
      // Only the migration logic is OS specific, the rest is common

      if (Platform.OS === "ios") {
        const _passports = await getValueFromSecureStorage(ALL_PASSPORTS_KEYCHAIN_SERVICE)

        // If the old data is present in the keychain, we need to migrate it to the file
        if (_passports) {
          // Encrypt the old data with the new encryption key and nonce
          const newEncryptedData = await encrypt(
            _passports,
            Binary.fromHex(encryptionKey!).toUInt8Array(),
            Binary.fromHex(nonce!).toUInt8Array(),
          )

          // Write the encrypted data to the file
          await FileSystem.writeAsStringAsync(
            PASSPORTS_FILE_PATH,
            `${Binary.fromHex(nonce!).toString("base64")}${Buffer.from(newEncryptedData).toString("base64")}`,
            {
              encoding: FileSystem.EncodingType.Base64,
            },
          )

          // Delete the old data from the keychain
          await deleteFromSecureStorage(ALL_PASSPORTS_KEYCHAIN_SERVICE)

          // Return the parsed JSON data
          return JSON.parse(_passports)
        }

        // Otherwise, if the file exists, we need to decrypt the data
        // and return the parsed JSON data
        if (fileExists.exists) {
          const rawData = await FileSystem.readAsStringAsync(PASSPORTS_FILE_PATH, {
            encoding: FileSystem.EncodingType.Base64,
          })

          // 16 base64 characters is 12 bytes, which is the nonce size
          const retrievedNonce = rawData.slice(0, 16)
          // The rest is the encrypted data
          const encryptedData = rawData.slice(16)

          if (encryptedData) {
            const dataBuffer = Buffer.from(encryptedData, "base64")
            const decryptedData = await decrypt(
              dataBuffer,
              Binary.fromHex(encryptionKey).toUInt8Array(),
              // retrievedNonce is the nonce in base64 format
              Binary.fromBase64(retrievedNonce).toUInt8Array(),
            )
            return JSON.parse(decryptedData)
          }
        }
        console.log("No data exists yet, returning empty object")
        // If no data exists yet, return empty object
        return {}
      } else {
        // On Android

        if (fileExists.exists) {
          const rawData = await FileSystem.readAsStringAsync(PASSPORTS_FILE_PATH, {
            encoding: FileSystem.EncodingType.Base64,
          })

          if (rawData) {
            // Get the old encryption key from the keychain
            const oldKey = await getValueFromSecureStorage(`${ALL_PASSPORTS_KEYCHAIN_SERVICE}Key`)
            // oldKey is present, so we need to migrate the data
            if (oldKey) {
              // If the old key is present, it means we need to migrate the data
              let decryptedBuffer: Uint8Array | undefined = undefined
              const dataBuffer = Buffer.from(rawData, "base64")
              // If the old key is 64 characters long, it's the original encryption key format
              // with a static nonce
              if (oldKey.length === 64) {
                decryptedBuffer = await decryptBuffer(
                  dataBuffer,
                  Binary.fromHex(oldKey!).toUInt8Array(),
                  await sha256Truncate(ALL_PASSPORTS_KEYCHAIN_SERVICE),
                )
              } else if (oldKey.length === 88) {
                // If the old key is 88 characters long, it's the more recent encryption key format
                // with a random nonce stored along with the encryption key
                decryptedBuffer = await decryptBuffer(
                  dataBuffer,
                  Binary.fromHex(oldKey.slice(0, 64)).toUInt8Array(),
                  Binary.fromHex(oldKey.slice(64, 88)).toUInt8Array(),
                )
              }
              if (!decryptedBuffer) {
                // We should never reach this point, but just in case
                throw new Error("Failed to decrypt data")
              }

              // Get the stringified JSON data
              const decryptedData = Buffer.from(decryptedBuffer).toString("utf-8")
              // Encrypt the data with the new encryption key and nonce
              const newEncryptedData = await encrypt(
                decryptedData,
                Binary.fromHex(encryptionKey!).toUInt8Array(),
                Binary.fromHex(nonce!).toUInt8Array(),
              )
              // Write the new encrypted data to the file
              await FileSystem.writeAsStringAsync(
                PASSPORTS_FILE_PATH,
                `${Binary.fromHex(nonce!).toString("base64")}${Buffer.from(newEncryptedData).toString("base64")}`,
                {
                  encoding: FileSystem.EncodingType.Base64,
                },
              )
              // Delete the old encryption key from the keychain
              await deleteFromSecureStorage(`${ALL_PASSPORTS_KEYCHAIN_SERVICE}Key`)
              // Return the parsed JSON data
              return JSON.parse(decryptedData)
            } else {
              // 16 base64 characters is 12 bytes, which is the nonce size
              const retrievedNonce = rawData.slice(0, 16)
              // The rest is the encrypted data
              const encryptedData = rawData.slice(16)
              // No old key, just use the master key to decrypt the data
              const dataBuffer = Buffer.from(encryptedData, "base64")
              const decryptedBuffer = await decryptBuffer(
                dataBuffer,
                Binary.fromHex(encryptionKey).toUInt8Array(),
                // retrievedNonce is the nonce in base64 format
                Binary.fromBase64(retrievedNonce).toUInt8Array(),
              )
              return JSON.parse(Buffer.from(decryptedBuffer).toString("utf-8"))
            }
          }
        }
        // If no data exists yet, return empty object
        return {}
      }
    } catch (error: any) {
      console.error("Error loading IDs: " + error)
      setFailedToLoadPassport(true)
      return {}
    }
  }

  const clearBaseProofs = async () => {
    await BaseProofService.clearBaseSubproofs(updateSettings)
  }

  const saveAllPassportsData = async (
    passportsData: Record<string, PassportViewModel>,
    _masterKey?: string,
  ): Promise<void> => {
    try {
      // TODO: Look into fixing this
      /*
      if (Platform.OS !== "ios") {
        const biometricCompatible = await checkBiometricCompatibility()
        if (biometricCompatible) {
          await authenticateWithBiometrics()
        }
      }*/
      const masterKey = _masterKey ?? (await getMasterKey())

      if (!masterKey) {
        throw new Error("No master key found")
      }

      const idDataEncryptionKey = await deriveSecretFromMasterKey(
        masterKey,
        MASTER_KEY_DERIVATION_IDS.id_data_encryption_key,
        32,
      )
      const idDataEncryptionNonce = getRandomBytesHex(12)

      // Encrypt the data
      const encryptedData = await encrypt(
        JSON.stringify(passportsData),
        Binary.fromHex(idDataEncryptionKey).toUInt8Array(),
        Binary.fromHex(idDataEncryptionNonce).toUInt8Array(),
      )

      const base64EncryptedData = Buffer.from(encryptedData).toString("base64")

      // Write encrypted data to file instead of AsyncStorage
      await FileSystem.writeAsStringAsync(
        PASSPORTS_FILE_PATH,
        // Append the nonce before the encrypted data
        `${Binary.fromHex(idDataEncryptionNonce).toString("base64")}${base64EncryptedData}`,
        {
          encoding: FileSystem.EncodingType.Base64,
        },
      )
    } catch (error) {
      console.error("Error saving IDs: " + error)
      throw error
    }
  }

  const hasPassportId = async (id: string) => {
    const allPassportsData = await getAllPassportsData()
    return !!allPassportsData && !!allPassportsData[id]
  }

  const getBaseSubproofs = async (
    id: string,
    passport: PassportViewModel,
    devMode: boolean,
    forceLowMemoryProver?: boolean,
  ) => {
    // Check if the base subproofs are already being generated
    // and if it's been less than 2 minutes since the generation started
    // to avoid generating the base subproofs multiple times
    if (
      settings.generatingBaseSubproofs &&
      Date.now() - settings.startedGeneratingBaseSubproofsAt < 1000 * 60 * 2
    ) {
      return
    }
    const storedSettings: MySettings = await loadSettings()
    let { circuitManifest, circuitVersion } = await checkManifestVersion()
    let baseSubproofs = await checkDuplicateProofs(circuitVersion, storedSettings, id)
    if (baseSubproofs && baseSubproofs.length === 3) {
      return baseSubproofs
    } else if (canGenerateProofs()) {
      if (!passport) {
        await updateSettings({
          generatingBaseSubproofs: false,
          startedGeneratingBaseSubproofsAt: 0,
        })
        return
      }
      let currentCircuit = ""
      const proofGenerationTimer = createOperationTimer("proof_generation")
      if (isIDSupported(passport)) {
        try {
          baseSubproofs = []
          await updateSettings({
            baseSubproofs: {
              [id]: [],
            },
            generatingBaseSubproofs: true,
            startedGeneratingBaseSubproofsAt: Date.now(),
            cleanExitDuringProofGeneration: false,
          })
          let salt: string | undefined
          try {
            salt = await getCommitmentSalt()
          } catch (error) {
            // Can fail if the user refuses to go through the OS authentication flow (such as Face ID)
            console.error("Error getting ID secret: " + error)
            await updateSettings({
              generatingBaseSubproofs: false,
              startedGeneratingBaseSubproofsAt: 0,
            })
            return
          }
          console.log("Generating base subproofs...")
          const proofService = BaseProofService.getInstance()

          // Create handler functions inline (since we can't use hooks here)
          const baseProofProgressHandler = (stage: string, details: any) => {
            if (stage === "start" || stage === "complete") {
              emitProofGenerationEvent(details)
            }
          }

          const baseProofTimingHandler = (proofType: string, isEnd?: boolean) => {
            if (isEnd) {
              proofGenerationTimer.endSubOperation(proofType)
            } else {
              proofGenerationTimer.startSubOperation(proofType)
            }
          }

          const baseProofErrorHandler = async (_error: any, proofType: string) => {
            proofGenerationTimer.endSubOperation(proofType)
            currentCircuit = proofType
            // errors handled in catch block
            return { handled: false, shouldReturn: true }
          }

          // Call BaseProofService with handlers
          baseSubproofs = await proofService.generateBaseSubproofs({
            passport,
            circuitManifest,
            salt,
            forceLowMemoryProver,
            onProgress: baseProofProgressHandler,
            onTimingOperation: baseProofTimingHandler,
            onError: baseProofErrorHandler,
            checkRAM: async () => checkRAMAndWarnUser(t),
            updateSettings,
            devMode,
          })

          const proofTiming = proofGenerationTimer.end()
          console.log("Total base subproofs generation time:", proofTiming.time_elapsed_ms)

          await updateSettings({
            baseSubproofs: {
              [id]: baseSubproofs,
            },
            generatingBaseSubproofs: false,
            startedGeneratingBaseSubproofsAt: 0,
            circuitBeingProven: "",
            currentProofGenerationProgress: undefined,
          })

          reportEvent(
            "base_proof_generation_succeeded",
            {
              // Variant names reveal the document's signature/hash algorithms
              circuits: baseSubproofs.map((p) => p.name),
              circuit_version: circuitVersion,
            },
            null,
            { passport, operationTiming: proofTiming },
          )
          return baseSubproofs
        } catch (error) {
          console.log("Error generating base subproofs:", error, (error as any)?.stack)
          // End the proof generation timer to capture partial timing
          const proofTiming = proofGenerationTimer.end()

          const failedStep = baseSubproofNameToStep(currentCircuit)
          reportEvent(
            "base_proof_generation_failed",
            {
              failed_step: failedStep,
              failed_circuit: currentCircuit || undefined,
              error_code:
                error instanceof ZKPassportError ? error.errorType : ErrorType.CIRCUIT_ERROR,
              circuit_version: circuitVersion,
            },
            null,
            { passport, operationTiming: proofTiming },
          )

          // Clean up settings first
          await updateSettings({
            generatingBaseSubproofs: false,
            startedGeneratingBaseSubproofsAt: 0,
            baseSubproofs: {
              [id]: [],
            },
            circuitBeingProven: "",
            currentProofGenerationProgress: undefined,
          })

          // Handle errors with proper type checking
          if (error instanceof MissingCscaError) {
            // Handle missing CSCA error with modal
            setCurrentPassportForError(passport)
            const autoReported = await reportError(error, null, passport)
            showCSCAModal(error, passport, autoReported)
            throw error
          } else if (error instanceof UnsupportedPassportError) {
            // Handle unsupported passport error with modal
            // Store error and passport for modal
            setCurrentPassportForError(passport)
            const autoReported = await reportError(error, null, passport)

            showUnsupportedModal(error, passport, autoReported)
            throw error
          } else if (error instanceof ZKPassportError) {
            // Already a properly typed error - just report and re-throw
            // Add timing context to the error
            if (error.context) {
              error.context.timing = proofTiming
            }
            await reportError(error, null, passport)
            throw error
          } else if (error instanceof Error) {
            // Wrap generic errors with context
            const enhancedError = createBaseSubproofError(
              error,
              baseSubproofs,
              currentCircuit,
              circuitVersion,
              proofTiming,
            )
            await reportError(enhancedError, null, passport)
            throw enhancedError
          } else {
            // Handle non-Error objects
            const wrappedError = createBaseSubproofError(
              new Error(String(error)),
              baseSubproofs,
              currentCircuit,
              circuitVersion,
              proofTiming,
            )
            await reportError(wrappedError, null, passport)
            throw wrappedError
          }
        }
      } else {
        const unsupportedError = createUnsupportedPassportError(
          UnsupportedPassportEnum.NOT_SUPPORTED,
          undefined,
          "Getting DSC circuit for unsupported ID",
        )

        setCurrentPassportForError(passport)

        const autoReported = await reportError(unsupportedError, null, passport)
        showUnsupportedModal(unsupportedError, passport, autoReported)
        throw unsupportedError
      }
    }
  }

  // Helper to get country code from passportId (used in history)
  const getPassportFromId = (passportId: string): PassportViewModel | undefined => {
    return passports[passportId]
  }

  const savePassport = async (
    passportData: PassportViewModel,
    isUnsupported: boolean = false,
    _masterKey?: string,
  ) => {
    let id: string
    try {
      // Generate a deterministic ID from the passport data
      id = bytesToHex(sha256(passportData.sod.signerInfo.signature.toUInt8Array()))
      if (await hasPassportId(id)) {
        if (passports[id]) {
          // Update the active passport to the one that was just scanned
          updateSettings({ activePassport: id })
          return
        } else {
          // Delete the passport from the keychain
          await deletePassport(id)
        }
      }

      // Get current passports data
      const allPassportsData = passports || (await getAllPassportsData(undefined, _masterKey)) || {}

      // Add new passport to dictionary
      allPassportsData[id] = passportData

      // Save updated passports dictionary
      await saveAllPassportsData(allPassportsData, _masterKey)

      // Update state
      setPassports((prev) => ({ ...prev, [id]: passportData }))

      // Don't wait for the base subproofs to be generated
      // do it in the background
      console.log("Starting base subproofs generation")

      // Ensure we have a valid array to work with
      const currentPassports = Array.isArray(settings.passports) ? settings.passports : []
      // Check if passport already exists in the list
      const passportExists = currentPassports.some((p) => p.id === id)

      // TODO: Review this with  theo, without this i get an error locally
      await updateSettings({
        activePassport: id,
        passports: passportExists ? currentPassports : [...currentPassports, { id: id }],
        hasAddedIdBefore: true,
      })

      // Add to unsupported list if needed
      if (isUnsupported) {
        addUnsupportedId(id)
      }
    } catch (error) {
      console.error("Error saving ID data: " + error)
      // Implement error handling here
    }

    // Validate passport data
    validatePassportData(passportData)

    try {
      InteractionManager.runAfterInteractions(async () => {
        console.log("Base subproofs generation started")
        try {
          await getBaseSubproofs(id, passportData, false, true)
        } catch (error) {
          // The error has already been reported inside getBaseSubproofs
          // Just log for debugging purposes
          console.log("Error generating base subproofs in background:", error)
        }
        console.log("Base subproofs generation finished")
      })
    } catch (error) {
      console.log("Error generating base subproofs:", error)
    }
  }

  const canGenerateProofs = () => {
    // Check that the device is not marked as having
    // not enough RAM
    return !settings.memoryTooLow
  }

  const getOrCreateUuid = async (): Promise<string> => {
    // Check if UUID already exists in settings
    if (settings.userUuid) {
      return settings.userUuid
    }

    // Check if UUID exists in AsyncStorage (persistent storage)
    try {
      const existingUuid = await storage.getItem("deviceUuid")
      if (existingUuid) {
        // Update settings with the persistent UUID
        await updateSettings({ userUuid: existingUuid })
        return existingUuid
      }
    } catch (error) {
      console.error("Error checking existing UUID: " + error)
    }

    const uuid = uuidv4()

    // Save to settings
    await updateSettings({ userUuid: uuid })

    // Save to storage, key should never be deleted
    try {
      await storage.setItem("deviceUuid", uuid)
    } catch (error) {
      console.error("Error saving UUID to AsyncStorage: " + error)
    }

    return uuid
  }

  const getMrzs = async (): Promise<string[]> => {
    // for each of the stored passports, get the mrz
    const mrzs = []

    // Check if passports object exists and is defined
    // was causing exception on android
    if (!passports || typeof passports !== "object") {
      return []
    }

    // Check if settings.passports array exists and is defined
    // was causing exception on android
    if (!settings.passports || !Array.isArray(settings.passports)) {
      console.log("settings.passports is undefined or not an array", settings.passports)
      return []
    }

    for (const passport of settings.passports) {
      // Check if passport data exists before accessing mrz
      const passportData = passports[passport.id]
      if (passportData && passportData.mrz) {
        mrzs.push(passportData.mrz)
      }
    }
    return mrzs
  }

  return (
    <SettingsContext.Provider
      value={{
        settings,
        updateSettings,
        deleteSettingsKeys,
        resetSettings,
        loadPassports,
        passports,
        savePassport,
        saveMockPassports,
        deletePassport,
        deleteAllPassports,
        getCommitmentSalt,
        getMasterKey,
        getMrzs,
        addUnsupportedId,
        checkUnsupportedId,
        getPassportFromId,
        getPassportIdFromNumber,
        currentPassport,
        failedToLoadPassport,
        passportsLoaded,
        getBaseSubproofs,
        canGenerateProofs,
        clearBaseProofs,
        onProofGenerationEvent: proofGenerationEventListener,
        setProofGenerationEventListener: (listener: (event: ProofGenerationEvent) => void) => {
          setProofGenerationEventListener(() => listener)

          // Replay queued events to the new listener
          if (queuedEvents.length > 0) {
            queuedEvents.forEach((event) => listener(event))
            setQueuedEvents([])
          }
        },
        getOrCreateUuid,
        showCSCANotFoundModal: cscaModal.visible,
        setShowCSCANotFoundModal: (show: boolean) => {
          if (!show) resetCSCAModal()
        },
        showUnsupportedPassportModal: unsupportedModal.visible,
        setShowUnsupportedPassportModal: (show: boolean) => {
          if (!show) resetUnsupportedModal()
        },
        isDevModeEnabled,
        toggleDevMode,
      }}
    >
      {children}
      <AlertModal
        visible={cscaModal.visible}
        onClose={resetCSCAModal}
        onAccept={async () => {
          await sendErrorToAPI(cscaModal.error as ErrorLog)
          await sendAnonymousMetadata(currentPassportForError as PassportViewModel)
          resetCSCAModal()
        }}
        icon={require("@/assets/images/zkpassport-logo.png")}
        iconSize={50}
        title={t("modals.certificateMissing.title")}
        description={t("modals.certificateMissing.description")}
        buttonText={t("modals.certificateMissing.sendReport")}
        buttonText2={t("modals.certificateMissing.notNow")}
      />
      <AlertModal
        visible={unsupportedModal.visible}
        onClose={resetUnsupportedModal}
        onAccept={async () => {
          await sendErrorToAPI(unsupportedModal.error as ErrorLog)
          await sendAnonymousMetadata(currentPassportForError as PassportViewModel)
          resetUnsupportedModal()
        }}
        icon={require("@/assets/images/zkpassport-logo.png")}
        iconSize={50}
        title={t("modals.unsupportedId.title")}
        description={t("modals.unsupportedId.description")}
        buttonText={t("modals.certificateMissing.sendReport")}
        buttonText2={t("modals.certificateMissing.notNow")}
      />
    </SettingsContext.Provider>
  )
}

// Custom hook to use the settings context
export const useSettings = () => {
  const context = useContext(SettingsContext)
  if (context === undefined) {
    throw new Error("useSettings must be used within a SettingsProvider")
  }
  return context
}

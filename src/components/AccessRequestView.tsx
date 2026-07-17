import React, { useEffect, useState, useRef, useMemo, useCallback } from "react"
import {
  View,
  StyleSheet,
  Dimensions,
  Alert,
  ScrollView,
  StatusBar,
  Platform,
  TouchableOpacity,
  NativeSyntheticEvent,
  NativeScrollEvent,
  Animated,
  LayoutChangeEvent,
  Linking,
} from "react-native"
import { activateKeepAwakeAsync, deactivateKeepAwake } from "expo-keep-awake"
import {
  AccessRequestHeader,
  IDSelectedCard,
  VerificationCriteriaList,
  AccessRequestActions,
  CriteriaItem,
  type AccessRequestActionsHandle,
} from "./AccessRequest"
import { UnableToContinue } from "./AccessRequest/UnableToContinue"
import { PrivacySummaryModal } from "./AccessRequest/PrivacySummaryModal"
import {
  CircuitManifest,
  getDSCProofPublicInputCount,
  getMerkleRootFromDSCProof,
  getProofData,
  IDCredential,
  NullifierType,
  PassportViewModel,
  ProofResult,
  QRCodeData,
  QueryResult,
} from "@zkpassport/utils"
import { useWebSocket } from "@/context/WebSocketContext"
import {
  canGenerateProofForCircuit,
  getAccessItems,
  getPassportFieldsFromQuery,
  hasQueryResultFalseValue,
} from "@/lib/credentials"
import {
  checkManifestVersion,
  clearCachedCircuitManifest,
  getCircuitManifest,
} from "@/lib/circuit-matcher"
import { useSettings } from "@/context/SettingsContext"
import { useError } from "@/context/ErrorContext"
import { isIDSupported } from "@zkpassport/utils"
import { useTranslation } from "react-i18next"
import { createOperationTimer, OperationTimer } from "@/services/TimingService"
import { getPassportUniqueId, getVersion } from "@/lib"
import {
  AppAttestNotSupportedError,
  FaceMatchMetrics,
  EventType,
  ErrorType,
  ZKPassportError,
  CircuitError,
  CircuitErrorSubType,
  SanctionsFailedError,
  OperationTiming,
} from "@/types/Error"
import {
  createGenericCircuitError,
  // eslint-disable-next-line import/no-unresolved
} from "@/lib/errorUtils"
import { useProofGenerationHandlers } from "@/hooks/proof"
import { reportActivity } from "@/services/ActivityReportingService"
import { reportEvent } from "@/services/EventReportingService"
import { createStepTimer, ProofStep } from "@/lib/proofSteps"
import BaseProofService, { DisclosureProofService } from "@/services/ProofService"
import { useAnimatedProgress } from "@/hooks/useAnimatedProgress"
import { DisclosureProofErrors, ProofModeEnum, StageEnum } from "@/types/ProofService"
import { extractAndroidAttestationMetadata } from "@/services/facematch/android-cert-metadata"
import FaceMatch from "./facematch/FaceMatch"
import { FaceMatchError, FaceMatchService, Faceprint } from "@/services/facematch/facematch"
import { DiskStorageService } from "@/services/StorageService"
import AppAttest from "../../modules/app-attest-module"
import { FaceMatchMode, type CosineScore } from "@/services/facematch/asn"
import { AttestationContainer } from "@/services/facematch/facematch"
import { getLoadingText } from "@/lib/utils/accessReq"
import { LoadingOverlay } from "./AccessRequest/LoadingOverlay"
import { HistoryService } from "@/services/HistoryService"
// import { setAccessRequestVisible, setCurrentDeepLinkTopic } from "@/lib/navigationState"
import { msgFromError } from "@/services/facematch/utils"
import { router } from "expo-router"
import { LinearGrad } from "./ui/Text/LinearGradient"
import { useQRScanner } from "@/context/QRScannerContext"
import { ArrowDown } from "lucide-react-native"
import { LinearGradient } from "expo-linear-gradient"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { authenticateWithBiometrics } from "@/lib/permissions"
import { RegistryClient } from "@zkpassport/registry"

const { width } = Dimensions.get("window")

const getBaseFailure = (error: unknown): { step?: ProofStep; circuit?: string } => {
  if (!(error instanceof ZKPassportError)) return {}
  const circuit = (error.context?.circuit_name as string | undefined) || undefined
  let step: ProofStep | undefined
  if (circuit?.includes("id_data")) step = ProofStep.IdData
  else if (circuit?.includes("dsc")) step = ProofStep.Dsc
  else if (circuit?.includes("integrity")) step = ProofStep.Integrity
  return { step, circuit }
}

const isSafeReturnUrl = (url: string | null | undefined): url is string => {
  if (!url) {
    return false
  }
  const match = /^([a-z][a-z0-9+.-]*):/i.exec(url)
  if (!match) {
    return false
  }
  const scheme = match[1].toLowerCase()
  return !["javascript", "data", "file"].includes(scheme)
}

interface AccessRequestViewProps {
  onClose: () => void
  credentialsRequest: QRCodeData | null
  passport: PassportViewModel | null
}

const AccessRequestView = ({ onClose, credentialsRequest, passport }: AccessRequestViewProps) => {
  const { t } = useTranslation()
  const {
    isDomainVerified,
    notifyAccept,
    notifyReject,
    notifyError,
    notifyProof,
    notifyDone,
    closeConnection,
  } = useWebSocket()
  const {
    settings,
    getCommitmentSalt,
    getBaseSubproofs,
    canGenerateProofs,
    updateSettings,
    passports,
    clearBaseProofs,
    deleteAllPassports,
  } = useSettings()

  const { reportError, resetCircuitErrorRetry, setRetryProofGeneration } = useError()
  const { closeScanner } = useQRScanner()

  // Use the active passport from settings, falling back to the prop
  const activePassport =
    settings.activePassport && passports[settings.activePassport]
      ? passports[settings.activePassport]
      : passport
  const [isLoading, setIsLoading] = useState(false)
  const [isComplete, setIsComplete] = useState(false)
  const circuitManifestRef = useRef<CircuitManifest | null>(null)
  const [waitingForBaseSubproofs, setWaitingForBaseSubproofs] = useState(false)
  const [domainVerifying, setDomainVerifying] = useState(false)
  // Add state for tooltip visibility
  const [hasNotifiedAccept, setHasNotifiedAccept] = useState(false)
  const [queryResults, setQueryResults] = useState<QueryResult | null>(null)
  const [loadingText, setLoadingText] = useState(t("accessRequest.verifying"))
  const accessRequestTimerRef = useRef<OperationTimer | null>(null)
  const [showFaceMatch, setShowFaceMatch] = useState(false)
  const faceMatchTimerRef = useRef<OperationTimer | null>(null)
  // Cache FaceMatch attestation for retries when base proofs are still generating
  const facematchAttestationRef = useRef<AttestationContainer | null>(null)
  const closeModalScheduledRef = useRef(false)
  const areBaseSubproofsCachedRef = useRef(false)
  const startedActivityReportedRef = useRef<string | null>(null)
  const finalActivityReportedRef = useRef<string | null>(null)
  const activityFields = (requestId: string) => ({
    requestId,
    domain: credentialsRequest?.domain ?? "",
    scope: credentialsRequest?.service?.scope,
    devMode: credentialsRequest?.devMode ?? false,
  })
  const reportFinalActivity = (
    requestId: string,
    fields: { status: "success" | "failed"; errorCode?: string; durationMs?: number },
  ) => {
    // Failures report once, but a success always passes: a retry can succeed after a failure
    if (finalActivityReportedRef.current === requestId && fields.status !== "success") return
    finalActivityReportedRef.current = requestId
    reportActivity({ ...activityFields(requestId), ...fields })
  }
  useEffect(() => {
    const pubkey = credentialsRequest?.pubkey
    if (!pubkey || startedActivityReportedRef.current === pubkey) return
    startedActivityReportedRef.current = pubkey
    reportActivity({ ...activityFields(pubkey), status: "started" })
  }, [credentialsRequest])
  const approvedRequestRef = useRef<string | null>(null)
  const rejectedRequestRef = useRef<string | null>(null)
  const proofOutcomeReportedRef = useRef<string | null>(null)
  const requestEventProps = () => ({
    domain: credentialsRequest?.domain ?? undefined,
    service_name: credentialsRequest?.service?.name ?? undefined,
    field_count: credentialsRequest?.query
      ? Object.keys(credentialsRequest.query).length
      : undefined,
    mode: credentialsRequest?.mode ?? undefined,
    dev_mode: credentialsRequest?.devMode ?? false,
    sdk_version: credentialsRequest?.sdkVersion ?? undefined,
  })
  const reportProofOutcome = (
    requestId: string,
    event: "proof_generation_succeeded" | "proof_generation_failed" | "proof_generation_cancelled",
    properties: Record<string, unknown>,
    operationTiming?: OperationTiming,
  ) => {
    if (proofOutcomeReportedRef.current === requestId && event !== "proof_generation_succeeded")
      return
    proofOutcomeReportedRef.current = requestId
    reportEvent(
      event,
      {
        ...requestEventProps(),
        ...properties,
      },
      requestId,
      { operationTiming },
    )
  }
  const [showPrivacyModal, setShowPrivacyModal] = useState(false)
  // Salted nullifier -> Maximum Privacy Mode (1), otherwise Standard Privacy Mode (0)
  const privacyMode: 0 | 1 =
    credentialsRequest?.uniqueIdentifierType === NullifierType.SALTED ||
    credentialsRequest?.uniqueIdentifierType === NullifierType.SALTED_MOCK
      ? 1
      : 0

  // // Add refs to track the position of the purpose icon
  // const purposeIconRef = useRef<View>(null)
  // const [iconPosition, setIconPosition] = useState({ x: 0, y: 0 })
  const [progress, setProgress] = useState(0)
  const [isScrolledToBottom, setIsScrolledToBottom] = useState(false)
  const [isSliderActive, setIsSliderActive] = useState(false)
  const scrollViewRef = useRef<ScrollView>(null)
  const actionsRef = useRef<AccessRequestActionsHandle>(null)
  const scrollIndicatorAnim = useRef(new Animated.Value(1)).current
  const safeAreaInsets = useSafeAreaInsets()

  // TODO: Make the back gesutre do nothing when the loading overlay is visible

  // useEffect(() => {
  //   setAccessRequestVisible(true)
  //   if (credentialsRequest?.topic) {
  //     setCurrentDeepLinkTopic(credentialsRequest.topic)
  //   }

  //   return () => {
  //     setAccessRequestVisible(false)
  //   }
  // }, [credentialsRequest?.topic])

  // Function to measure and update icon position
  // const measureIconPosition = () => {
  //   if (purposeIconRef.current) {
  //     purposeIconRef.current.measure((_fx, _fy, _width, _height, px, py) => {
  //       setIconPosition({ x: px, y: py })
  //     })
  //   }
  // }

  const getBaseProofProgressShare = () => {
    if (credentialsRequest?.mode === "fast") {
      return areBaseSubproofsCachedRef.current ? 10 : 85
    } else {
      return areBaseSubproofsCachedRef.current ? 10 : 50
    }
  }

  // Use the animated progress hook
  const { animateProgress, clearProgressAnimation } = useAnimatedProgress({
    onProgressChange: setProgress,
  })

  useEffect(() => {
    if (!credentialsRequest?.topic) {
      return
    }

    setIsLoading(false)
    setIsComplete(false)
    setWaitingForBaseSubproofs(false)
    setHasNotifiedAccept(false)
    // setShowPassportSelector(false)
    setQueryResults(null)
    setLoadingText(t("accessRequest.verifying"))
    setProgress(0)
    setShowFaceMatch(false)
    setIsScrolledToBottom(false)
    startedBaseProofGenerationRef.current = false
    closeModalScheduledRef.current = false

    if (accessRequestTimerRef.current?.isRunning()) {
      accessRequestTimerRef.current.end()
    }
    accessRequestTimerRef.current = null

    if (faceMatchTimerRef.current?.isRunning()) {
      faceMatchTimerRef.current.end()
    }
    faceMatchTimerRef.current = null

    clearProgressAnimation()
    setRetryProofGeneration(null)
  }, [credentialsRequest?.topic, t])

  useEffect(() => {
    ;(async () => {
      if (activePassport && credentialsRequest?.query) {
        setQueryResults(getPassportFieldsFromQuery(credentialsRequest?.query!, activePassport))
      }
    })()
  }, [activePassport, credentialsRequest])

  useEffect(() => {
    // Prefetch the circuit manifest so the user doesn't have to wait for it to be fetched
    // when clicking on confirm
    getCircuitManifest().then((manifest) => {
      circuitManifestRef.current = manifest
    })
  }, [])

  useEffect(() => {
    if (!credentialsRequest?.topic) {
      return
    }

    if (credentialsRequest.devMode) {
      console.log("dev mode is enabled, skipping domain verification")
      setDomainVerifying(false)
      return
    }

    setDomainVerifying(true)
    const timeout = setTimeout(() => {
      // If the domain is not verified after 30 seconds, we consider it as not verified
      setDomainVerifying(false)
    }, 30000)

    return () => clearTimeout(timeout)
  }, [credentialsRequest?.topic])

  useEffect(() => {
    if (isDomainVerified) {
      setDomainVerifying(false)
    }
  }, [isDomainVerified])

  // Animate scroll indicator appearance/disappearance
  useEffect(() => {
    Animated.timing(scrollIndicatorAnim, {
      toValue: isScrolledToBottom ? 0 : 1,
      duration: 250,
      useNativeDriver: true,
    }).start()
  }, [isScrolledToBottom, scrollIndicatorAnim])

  // Use custom hook for proof generation handlers
  const {
    integrityProofNestedOperationHandler,
    accessRequestProgressHandler,
    startedBaseProofGenerationRef,
  } = useProofGenerationHandlers({
    accessRequestTimerRef,
    animateProgress,
    setLoadingText,
    getLoadingText,
    getBaseProofProgressShare,
    credentialsRequest,
    notifyError,
    setProgress,
    settings,
    t,
  })

  const closeModal = useCallback(() => {
    if (closeModalScheduledRef.current) {
      return
    }

    closeModalScheduledRef.current = true

    // Close the modal immediately for better UX
    onClose()

    // Do cleanup in the background
    setTimeout(() => {
      closeConnection()
      setIsLoading(false)
      setIsComplete(false)
      setHasNotifiedAccept(false)
      setProgress(0)
      startedBaseProofGenerationRef.current = false
      facematchAttestationRef.current = null
      closeModalScheduledRef.current = false
    }, 1000)
  }, [closeConnection, onClose, setHasNotifiedAccept, setIsComplete, setIsLoading, setProgress])

  const handleComplete = useCallback(() => {
    const returnDeepLink = credentialsRequest?.returnDeepLink
    if (isSafeReturnUrl(returnDeepLink)) {
      Linking.openURL(returnDeepLink).catch((error) => {
        console.log("Failed to open returnDeepLink:", error)
      })
    }
    closeModal()
  }, [credentialsRequest?.returnDeepLink, closeModal])

  useEffect(() => {
    if (!settings.generatingBaseSubproofs && waitingForBaseSubproofs) {
      setWaitingForBaseSubproofs(false)
      // Use cached facematch attestation if available, this fixes bug where facematch fails to generate after the base proofs are generated
      handleAccept(true, facematchAttestationRef.current ?? undefined)
    }
  }, [settings])

  // Keep the screen awake when loading
  useEffect(() => {
    if (isLoading || showFaceMatch) {
      activateKeepAwakeAsync("verification")
    } else {
      deactivateKeepAwake("verification")
    }

    // Cleanup: deactivate keep awake when component unmounts
    return () => {
      deactivateKeepAwake("verification")
    }
  }, [isLoading])

  // Cleanup progress animation and timer on unmount
  useEffect(() => {
    return () => {
      clearProgressAnimation()
      // End timer if component unmounts while timer is running
      if (accessRequestTimerRef.current?.isRunning()) {
        accessRequestTimerRef.current.end()
      }
    }
  }, [])

  const resetCache = async () => {
    // Clear all caches
    await clearBaseProofs()
    await clearCachedCircuitManifest()

    // Clear facematch cache
    try {
      const storage = new DiskStorageService()
      const facematch = new FaceMatchService({ storage, appAttest: AppAttest })
      for (const passport of settings.passports) {
        await facematch.removeKeyId(passport.id)
      }
    } catch (error) {
      console.error("Error clearing facematch cache:", error)
    }
  }

  const handleAccept = async (isRetry = false, facematchAttestation?: AttestationContainer) => {
    let currentCircuit = ""
    let attemptedCircuits: string[] = []
    let reportedCircuitVersion: string | undefined
    const stepTimer = createStepTimer()
    const succeededDisclosureCircuits: string[] = []
    const failedDisclosureCircuits: { name: string; error: string }[] = []
    const disclosureProofCountRef = { current: 0 }
    if (!queryResults) {
      return
    }

    // Validate FaceMatch attestation is provided when required
    if (queryResults?.facematch && !facematchAttestation) {
      throw new CircuitError(
        CircuitErrorSubType.MissingAttestation,
        "FaceMatch attestation is required but was not provided",
        { circuit_name: "facematch, at handle accept" },
      )
    }

    // Start access request timer
    if (!isRetry) {
      // Don't require authentication if FaceMatch has already been completed
      // as it's even stronger check than Face ID
      if (settings.requireAuthForVerification && !facematchAttestation) {
        // If you trigger FaceID too quickly, the haptic feedback of the slider
        // will be suppressed, so we wait for 300ms to avoid this
        await new Promise((resolve) => setTimeout(resolve, 300))
        const result = await authenticateWithBiometrics()
        if (!result) {
          // Reset slider to initial position if auth failed
          actionsRef.current?.resetSlider()
          return
        }
      }
      accessRequestTimerRef.current = createOperationTimer("access_request")

      if (credentialsRequest?.pubkey && approvedRequestRef.current !== credentialsRequest.pubkey) {
        approvedRequestRef.current = credentialsRequest.pubkey
        reportEvent("request_approved", requestEventProps(), credentialsRequest.pubkey)
      }
    }

    areBaseSubproofsCachedRef.current = await BaseProofService.areBaseSubproofsCached(settings)
    accessRequestTimerRef.current?.addMetadata({
      baseproofs_cached: areBaseSubproofsCachedRef.current,
    })

    try {
      if (!activePassport) {
        return
      }
      if (isIDSupported(activePassport) && canGenerateProofs()) {
        setIsLoading(true)
        if (!isRetry && !settings.generatingBaseSubproofs) {
          animateProgress(0, 5, 10000)
        }
        let baseSubproofs: ProofResult[] | undefined
        if (!hasNotifiedAccept) {
          await notifyAccept()
          setHasNotifiedAccept(true)
        }

        // Start base subproofs timer
        if (accessRequestTimerRef.current) {
          accessRequestTimerRef.current.startSubOperation("base_subproof_generation")
        }

        try {
          // This is equivalent to using settings.activePassport,
          // but to make sure there isn't a state issue with the active passport
          // we use the passport data itself to generate the unique id
          // and make sure the passport and active passport match
          const passportId = getPassportUniqueId(activePassport)
          // If there's a mismatch between the selected passport and the active passport, log it
          if (passportId !== settings.activePassport) {
            console.log(
              "Passport ID mismatch, expected: " +
                settings.activePassport +
                ", actual: " +
                passportId,
            )
          }
          const results = await getBaseSubproofs(
            passportId,
            activePassport,
            credentialsRequest?.devMode ?? false,
          )
          if (results) {
            // Check if the cached proof was generated against the requested chainId
            const dscProof = results.find((proof) => proof.name?.startsWith("sig_check_dsc"))!
            // Extract certificate root from the proof
            const dscProofData = getProofData(dscProof.proof!, getDSCProofPublicInputCount())
            const certificateRoot = getMerkleRootFromDSCProof(dscProofData)

            const chainId = credentialsRequest?.devMode ? 11155111 : 1
            const registryClient = new RegistryClient({ chainId })
            const latestCertificateRoot = await registryClient.getLatestCertificateRoot()
            const latestCertificateRootBigInt = BigInt(latestCertificateRoot)
            if (latestCertificateRootBigInt !== certificateRoot) {
              console.log(
                `Cached proof was generated against the wrong certificate root, resetting cache. Expected: ${certificateRoot}, Actual: ${latestCertificateRoot}`,
              )
              await resetCache()
              await handleAccept(true, facematchAttestationRef.current ?? undefined)
              return
            }

            baseSubproofs = results
            if (!isRetry && !startedBaseProofGenerationRef.current) {
              animateProgress(5, getBaseProofProgressShare(), 15000)
            }
          }
        } catch (error) {
          setIsLoading(false)

          if (
            error instanceof CircuitError &&
            error.errorSubType === CircuitErrorSubType.ProofGenerationFailed &&
            (error.context?.circuit_name?.includes("id_data") ||
              error.context?.circuit_name?.includes("dsc") ||
              error.context?.circuit_name?.includes("integrity")) &&
            activePassport &&
            activePassport.nationality === "ZKR"
          ) {
            // If the base proofs generation failed for a mock passport,
            // we should erase all the passports and redirect the user to the start screen
            // This is because it likely indicates that old unsupported mock passports are still present
            await deleteAllPassports()
            Alert.alert(
              t("errors.oldUnsupportedZKRPassport"),
              t("errors.oldUnsupportedZKRPassportDescription"),
            )
            if (router.canGoBack()) {
              router.back()
            } else {
              router.replace("/")
            }

            if (accessRequestTimerRef.current) {
              accessRequestTimerRef.current.endSubOperation(StageEnum.BaseSubproofGeneration)
            }
            // Return here and don't throw or report the error
            return
          }

          // End timers on error
          if (accessRequestTimerRef.current) {
            accessRequestTimerRef.current.endSubOperation(StageEnum.BaseSubproofGeneration)
            const timing = accessRequestTimerRef.current.end()

            // Set retry callback for proof generation
            setRetryProofGeneration(async () => {
              console.log("Retrying proof generation")
              await resetCache()
              await handleAccept(true, facematchAttestationRef.current ?? undefined)
            })

            // Report the enhanced error to API if it's a ZKPassportError
            if (error instanceof ZKPassportError) {
              if (error.context) {
                error.context.timing = timing
              }
              await reportError(error, null, activePassport)
            } else {
              const enhancedError = createGenericCircuitError(
                error,
                currentCircuit,
                attemptedCircuits,
                timing,
              )
              await reportError(enhancedError, null, activePassport)
            }

            if (credentialsRequest?.pubkey) {
              const errorCode =
                error instanceof ZKPassportError ? error.errorType : ErrorType.CIRCUIT_ERROR
              const baseFailure = getBaseFailure(error)
              reportProofOutcome(
                credentialsRequest.pubkey,
                "proof_generation_failed",
                {
                  failed_step: baseFailure.step,
                  failed_circuit: baseFailure.circuit,
                  circuits_completed_count: succeededDisclosureCircuits.length,
                  error_code: errorCode,
                },
                timing,
              )
              reportFinalActivity(credentialsRequest.pubkey, {
                status: "failed",
                errorCode,
                durationMs: timing.time_elapsed_ms,
              })
            }
          }

          return
        }
        if (!baseSubproofs) {
          if (settings.generatingBaseSubproofs) {
            setWaitingForBaseSubproofs(true)
            return
          }
          setIsLoading(false)
          return
        }

        // End base subproofs timer
        if (accessRequestTimerRef.current) {
          accessRequestTimerRef.current.endSubOperation(StageEnum.BaseSubproofGeneration)
        }

        if (accessRequestTimerRef.current) {
          accessRequestTimerRef.current.addMetadata({
            identity_proof_regenerated: false, // Default to false, will be overridden if regeneration occurs
          })
        }

        // Track base subproofs
        baseSubproofs.forEach((proof) => {
          if (proof.name) {
            attemptedCircuits.push(proof.name)
          }
        })
        const salt = await getCommitmentSalt()
        // Use the prefetched circuit manifest if available, otherwise fetch it
        const manifestRef = circuitManifestRef.current ?? undefined
        const { circuitManifest, circuitVersion } = await checkManifestVersion(manifestRef)
        reportedCircuitVersion = circuitVersion

        // Initialize DisclosureProofService
        const disclosureProofService = DisclosureProofService.getInstance()

        console.log("Generating access request proofs")

        // Start disclosure proofs timer when we begin disclosure proof generation
        const disclosureProofsTimerStartedRef = { current: false }

        const progressHandler = accessRequestProgressHandler(
          disclosureProofCountRef,
          succeededDisclosureCircuits,
          failedDisclosureCircuits,
          attemptedCircuits,
          disclosureProofsTimerStartedRef,
          t,
        )

        try {
          const result = await disclosureProofService.generateAccessRequestProofs({
            passport: activePassport,
            baseSubproofs,
            query: credentialsRequest?.query!,
            credentialsRequest: credentialsRequest as QRCodeData,
            salt,
            circuitManifest,
            circuitVersion,
            facematchAttestation: facematchAttestation ?? undefined,
            updateSettings,
            canGenerateProofForCircuit,
            onProgress: (stage, details) => {
              stepTimer.onStage(stage)
              progressHandler(stage, details)
            },
            /* onProofGenerated: async (proof) => {
              // Send proof to the service
              await notifyProof({
                ...proof,
                version: circuitVersion,
              })
            },*/
            onNestedOperation: integrityProofNestedOperationHandler(),
          })

          // Update attemptedCircuits with the results
          attemptedCircuits = result.attemptedCircuits ?? []

          // Update baseSubproofs with validated ones
          baseSubproofs = result.baseSubproofs

          // Update currentCircuit if available
          if (result.currentCircuit) {
            currentCircuit = result.currentCircuit
          }

          // If an outer proof was generated, send it to the service
          if (!!result.outerProof) {
            await notifyProof({
              ...result.outerProof,
              version: circuitVersion,
              index: 0,
              total: 1,
            })
          } else {
            let index = 0
            const total = result.baseSubproofs.length + result.disclosureProofs.length
            // If no outer proof was generated, send directly the base subproofs to the service
            for (const proof of result.baseSubproofs) {
              await notifyProof({
                ...proof,
                version: circuitVersion,
                index: index,
                total: total,
              })
              index += 1
            }

            // ... and the disclosure proofs
            for (const proof of result.disclosureProofs) {
              await notifyProof({
                ...proof,
                version: circuitVersion,
                index: index,
                total: total,
              })
              index += 1
            }
          }

          // End disclosure proofs timer if it was started
          if (disclosureProofsTimerStartedRef.current && accessRequestTimerRef.current) {
            accessRequestTimerRef.current.endSubOperation(StageEnum.DisclosureProofs)
          }

          // Handle mode-specific final progress
          if (credentialsRequest?.mode === ProofModeEnum.Fast) {
            animateProgress(98, 100, 2000)
            setLoadingText(t("accessRequest.sendingProof"))
          }
        } catch (error) {
          // End disclosure proofs timer if error occurred
          if (disclosureProofsTimerStartedRef.current && accessRequestTimerRef.current) {
            accessRequestTimerRef.current.endSubOperation(StageEnum.DisclosureProofs)
          }

          console.log("Error generating proofs: " + error + "\nCircuit version: " + circuitVersion)

          // Check if this is a cloud prover error that needs timer cleanup
          if (error instanceof ZKPassportError && error.errorType === "CLOUD_PROVER_ERROR") {
            // End outer compression timers if they were started
            if (accessRequestTimerRef.current) {
              // Check if we started the outer compression operation
              try {
                accessRequestTimerRef.current.endNestedSubOperation(
                  StageEnum.OuterCompression,
                  StageEnum.CloudProverRequest,
                )
                accessRequestTimerRef.current.endSubOperation(StageEnum.OuterCompression)
              } catch (e) {
                // Timer might not have been started if error occurred early
                console.log("Timer cleanup error (non-critical):", e)
              }
            }
          }

          // The error is already properly typed from the service layer, just re-throw it
          throw error
        }

        // End access request timer and get timing
        const accessRequestTiming = accessRequestTimerRef.current?.end()
        setLoadingText(t("accessRequest.sendingProof"))

        resetCircuitErrorRetry()

        if (credentialsRequest?.pubkey) {
          reportProofOutcome(
            credentialsRequest.pubkey,
            "proof_generation_succeeded",
            {
              circuit_count: succeededDisclosureCircuits.length,
              circuit_version: circuitVersion,
              used_cloud_prover_for_outer: credentialsRequest?.mode !== ProofModeEnum.Fast,
              ...stepTimer.durations,
            },
            accessRequestTiming,
          )
          reportFinalActivity(credentialsRequest.pubkey, {
            status: "success",
            durationMs: accessRequestTiming?.time_elapsed_ms,
          })
        }

        const sanctionPassed =
          succeededDisclosureCircuits.includes("exclusion_check_sanctions") ||
          succeededDisclosureCircuits.includes("exclusion_check_sanctions_evm")
        const facematchPassed = succeededDisclosureCircuits.some((circuit) =>
          circuit.startsWith("facematch"),
        )
        const finalQueryResult = getPassportFieldsFromQuery(
          credentialsRequest?.query!,
          activePassport!,
          sanctionPassed,
          facematchPassed,
        )
        setQueryResults(finalQueryResult)
        const historyAccessItems = computeCriteriaItems(finalQueryResult, {
          includeAsyncStatuses: true,
        })

        await HistoryService.addItem(
          { settings, updateSettings },
          {
            passportId: settings.activePassport!,
            passport: activePassport!,
            credentialsRequest: credentialsRequest as QRCodeData,
            accessItems: historyAccessItems,
          },
        )

        setTimeout(async () => {
          setIsLoading(false)
          setIsComplete(true)
          await notifyDone(finalQueryResult)
        }, 2000)
      } else {
        setIsLoading(true)

        if (!canGenerateProofs()) {
          await notifyError("The user's device does not have enough memory to proceed")
        } else {
          await notifyError("This ID is not supported yet")
        }

        // If the Document is not supported yet or the device doesn't have enough memory
        // we only sent back the result without proofs to the app that requested it
        // So the guarantee is weaker here but at least the app can still get some information
        // and it's up to the app to decide if it wants to proceed or not with this level of guarantee
        setTimeout(async () => {
          setIsLoading(false)
          setIsComplete(true)
          await notifyDone(
            getPassportFieldsFromQuery(credentialsRequest?.query!, activePassport!, false, false),
          )
        }, 1000)
      }
    } catch (error) {
      console.log(
        t("errors.proofGenerationError") +
          "\nCircuit: " +
          currentCircuit +
          "\nError: " +
          JSON.stringify(error),
      )
      setIsLoading(false)

      if (error instanceof SanctionsFailedError) {
        await notifyError("Sanctions check failed")
      }

      // End timer and get timing for error context
      const errorTiming = accessRequestTimerRef.current?.end()

      // Set retry callback for proof generation
      setRetryProofGeneration(async () => {
        console.log("Retrying proof generation")
        await resetCache()
        // Use cached FaceMatch attestation if available (required for FaceMatch flows)
        await handleAccept(true, facematchAttestationRef.current ?? undefined)
      })

      // Report error to API with proper error type
      if (error instanceof ZKPassportError) {
        if (error.context && errorTiming) {
          error.context.timing = errorTiming
        }
        await reportError(error, null, activePassport)
      } else {
        const enhancedError = createGenericCircuitError(
          error,
          currentCircuit,
          attemptedCircuits,
          errorTiming,
        )
        await reportError(enhancedError, null, activePassport)
      }

      // Base-subproof failures are reported in their own catch above and return before here.
      if (credentialsRequest?.pubkey) {
        const errorCode =
          error instanceof ZKPassportError ? error.errorType : ErrorType.CIRCUIT_ERROR
        reportProofOutcome(
          credentialsRequest.pubkey,
          "proof_generation_failed",
          {
            failed_step: stepTimer.runningStep() ?? ProofStep.DisclosureProofs,
            failed_circuit: currentCircuit || undefined,
            circuits_completed_count: succeededDisclosureCircuits.length,
            circuit_version: reportedCircuitVersion,
            error_code: errorCode,
            ...stepTimer.durations,
          },
          errorTiming,
        )
        reportFinalActivity(credentialsRequest.pubkey, {
          status: "failed",
          errorCode,
          durationMs: errorTiming?.time_elapsed_ms,
        })
      }
    }
  }

  const handleCancel = async () => {
    // End the proving timer first so the cancel event can report how long the user waited
    let cancelTiming
    if (accessRequestTimerRef.current?.isRunning()) {
      cancelTiming = accessRequestTimerRef.current.end()
    }

    if (credentialsRequest?.pubkey) {
      const pubkey = credentialsRequest.pubkey
      if (approvedRequestRef.current === pubkey) {
        reportProofOutcome(pubkey, "proof_generation_cancelled", {}, cancelTiming)
        reportFinalActivity(pubkey, {
          status: "failed",
          errorCode: EventType.PROOF_GENERATION_CANCELLED,
        })
      } else {
        if (rejectedRequestRef.current !== pubkey) {
          rejectedRequestRef.current = pubkey
          reportEvent("request_rejected", requestEventProps(), pubkey)
        }
        reportFinalActivity(pubkey, {
          status: "failed",
          errorCode: EventType.REQUEST_REJECTED,
        })
      }
    }

    // clean up the state
    try {
      // Don't fail if the reject notification fails
      await notifyReject()
    } catch (error) {
      console.log("Error notifying reject:", error)
    }
    closeConnection()
    setRetryProofGeneration(null)
    setIsLoading(false)
    setIsComplete(false)
    setHasNotifiedAccept(false)
    // Clear cached FaceMatch attestation
    facematchAttestationRef.current = null
    closeScanner() // TESTING, ensures cleanup of the scanner

    // close the modal
    onClose()
  }

  const handleDomainNotVerified = () => {
    if (domainVerifying) {
      Alert.alert(t("accessRequest.domainVerifyingTitle"), t("accessRequest.domainVerifying"))
      return
    } else {
      Alert.alert(t("accessRequest.domainNotVerifiedTitle"), t("accessRequest.domainNotVerified"))
    }
  }

  // Passport selection handler
  const handlePassportSelect = (passportId: string) => {
    updateSettings({ activePassport: passportId })
  }

  const computeCriteriaItems = useCallback(
    (result: QueryResult | null, options?: { includeAsyncStatuses?: boolean }): CriteriaItem[] => {
      if (!result || !credentialsRequest?.query) {
        return []
      }

      const accessItems = getAccessItems(
        credentialsRequest.query,
        result,
        t,
        activePassport ?? undefined,
      )
      const includeAsyncStatuses = options?.includeAsyncStatuses ?? false

      return accessItems.map((item, index) => {
        const sanctionPassed = result.sanctions?.passed
        const facematchPassed = result.facematch?.passed
        const passed =
          item.credential === "bind"
            ? true
            : item.credential === "sanctions"
              ? includeAsyncStatuses
                ? sanctionPassed !== false
                : true
              : item.credential === "facematch"
                ? includeAsyncStatuses
                  ? facematchPassed !== false
                  : true
                : !hasQueryResultFalseValue(result, item.credential as IDCredential)

        return {
          id: `criteria-${index}`,
          question: item.displayName,
          // Don't show result for sanctions and facematch as they are not pre-checked
          result:
            item.credential === "sanctions" || item.credential === "facematch"
              ? undefined
              : item.result,
          criteria: item.description || (passed ? "Passed" : "Failed"),
          info: item.info,
          moreInfo: item.moreInfo,
          isCollapsed: true,
          passed,
        }
      })
    },
    [credentialsRequest?.query, t, activePassport],
  )

  const criteriaItems = computeCriteriaItems(queryResults)

  const allCriteriaPassed = useMemo(() => {
    if (criteriaItems.length === 0) {
      return true
    }
    return criteriaItems.every((item) => item.passed)
  }, [criteriaItems])

  const meetsAllCriteria = useCallback(() => allCriteriaPassed, [allCriteriaPassed])

  // The request can't be satisfied, so no proof will run; report a failure. The criteria default
  // to passed until results load, so this can't fire before they are known.
  useEffect(() => {
    const pubkey = credentialsRequest?.pubkey
    if (!pubkey || allCriteriaPassed) return
    reportFinalActivity(pubkey, {
      status: "failed",
      errorCode: DisclosureProofErrors.CriteriaNotMet,
    })
  }, [allCriteriaPassed, credentialsRequest])

  const handleFaceMatchComplete = async (
    dg2Faceprint: Faceprint,
    cosineAvgSimilarity: CosineScore,
    cosineThreshold: CosineScore,
    metrics: FaceMatchMetrics,
  ) => {
    try {
      const faceMatchTiming = faceMatchTimerRef.current?.end()
      // Destructured only to exclude it: the event name already says whether the run completed
      const { completed: _completed, ...metricProps } = metrics
      reportEvent(
        "face_match_completed",
        {
          ...metricProps,
          matched: cosineAvgSimilarity >= cosineThreshold,
        },
        credentialsRequest?.pubkey,
        { operationTiming: faceMatchTiming },
      )

      const attestationStartedAtMs = Date.now()

      const storage = new DiskStorageService()
      const facematch = new FaceMatchService({ storage, appAttest: AppAttest })

      if (!(await facematch.isSupported())) {
        console.warn("App Attest is not supported!")
        return
      }

      const passportUniqueId = getPassportUniqueId(activePassport!)
      console.log(`passportUniqueId: ${passportUniqueId}`)
      // Get existing SE keyId for a given passportUniqueId or generate a new one
      const keyId = await facematch.getExistingOrGenerateNewKeyId(passportUniqueId)
      console.log(`keyId: ${keyId}`)

      const dg2 = activePassport?.dataGroups.find((dg) => dg.groupNumber === 2)
      if (!dg2 || !dg2.hash) throw new Error("Error getting DG2 hash from passport")
      const dg2HashNormalized = new Uint8Array(dg2.hash)

      // Get existing key attestation or generate a new one
      let attestation = await facematch.getExistingKeyAttestation(
        keyId,
        credentialsRequest?.query?.facematch?.mode === "regular"
          ? FaceMatchMode.regular
          : FaceMatchMode.strict,
      )
      const attestationCached = !!attestation
      if (!attestation) {
        console.log(`Generating new key attestation for keyId ${keyId}`)

        const appVersion = getVersion()

        attestation = await facematch.generateKeyAttestationWithClientData(
          keyId,
          appVersion,
          dg2HashNormalized, // DG2 hash normalized (reference image hash)
          dg2Faceprint,
          cosineAvgSimilarity, // cosineAvgSimilarity: e.g. 0.87321021 * 1e8
          cosineThreshold, // cosineThreshold: e.g. 0.5 * 1e8
          credentialsRequest?.query?.facematch?.mode === "regular"
            ? FaceMatchMode.regular
            : FaceMatchMode.strict,
        )

        console.log(`New key attestation generated for keyId ${keyId}`)
        console.log(JSON.stringify(attestation.toJSON(), null, 2))
      } else {
        console.log(`Found existing key attestation for keyId ${keyId}`)
        console.log(JSON.stringify(attestation.toJSON(), null, 2))
      }

      const attestationDurationMs = Date.now() - attestationStartedAtMs

      const attestationMetadata =
        Platform.OS === "android" ? await extractAndroidAttestationMetadata(attestation) : undefined

      reportEvent(
        "attestation_generated",
        {
          duration_ms: attestationDurationMs,
          cached: attestationCached,
          security_level: attestationMetadata?.credentialMetadata?.attestationSecurityLevel?.name,
        },
        credentialsRequest?.pubkey,
      )

      // Cache the attestation for retries (in case base proofs are still generating)
      facematchAttestationRef.current = attestation

      setShowFaceMatch(false)
      handleAccept(false, attestation)
    } catch (error) {
      if (error instanceof FaceMatchError) {
        await reportError(error, null, activePassport)
      } else {
        await reportError(
          new FaceMatchError(
            `Failed to handle face match complete: ${msgFromError(error)}`,
            "FACEMATCH_ERROR",
            {
              error,
            },
          ),
          null,
          activePassport,
        )
      }
    }
  }

  const scrollViewLayoutRef = useRef<{ height: number }>({ height: 0 })

  const handleScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { layoutMeasurement, contentOffset, contentSize } = event.nativeEvent
    const paddingToBottom = 150 // Threshold for "close enough" to bottom
    const isAtBottom =
      layoutMeasurement.height + contentOffset.y >= contentSize.height - paddingToBottom
    setIsScrolledToBottom(isAtBottom)
  }, [])

  const handleScrollViewLayout = useCallback((event: LayoutChangeEvent) => {
    scrollViewLayoutRef.current.height = event.nativeEvent.layout.height
  }, [])

  const handleContentSizeChange = useCallback((_width: number, contentHeight: number) => {
    const paddingToBottom = 150
    const layoutHeight = scrollViewLayoutRef.current.height
    if (layoutHeight > 0 && contentHeight <= layoutHeight + paddingToBottom) {
      setIsScrolledToBottom(true)
    }
  }, [])

  const scrollToBottom = useCallback(() => {
    scrollViewRef.current?.scrollToEnd({ animated: true })
  }, [])

  const onShowFaceMatch = async () => {
    const storage = new DiskStorageService()
    const facematch = new FaceMatchService({ storage, appAttest: AppAttest })

    if (!(await facematch.isSupported())) {
      console.warn("App Attest is not supported!")
      await reportError(
        new AppAttestNotSupportedError(t("errors.facematch.appAttestNotSupported")),
        null,
        activePassport,
      )
      return
    }
    setShowFaceMatch(true)
  }

  return (
    <>
      <PrivacySummaryModal
        visible={showPrivacyModal}
        onClose={() => setShowPrivacyModal(false)}
        mode={privacyMode}
      />
      {showFaceMatch && activePassport && (
        <FaceMatch
          passport={activePassport}
          onComplete={handleFaceMatchComplete}
          onCancel={(metrics) => {
            // In case of early exit, end face match timing
            const faceMatchTiming = faceMatchTimerRef.current?.end()

            // Destructured only to exclude it: the event name already says whether the run completed
            const { completed: _completed, ...metricProps } = metrics
            reportEvent("face_match_cancelled", { ...metricProps }, credentialsRequest?.pubkey, {
              operationTiming: faceMatchTiming,
            })

            setShowFaceMatch(false)
            // Reset slider active state to restore scroll functionality
            setIsSliderActive(false)
          }}
          mode={credentialsRequest?.query?.facematch?.mode}
          faceMatchTimer={faceMatchTimerRef.current}
        />
      )}
      {(!showFaceMatch || !activePassport) && (
        <View style={styles.fullScreenContainer}>
          <StatusBar barStyle="light-content" backgroundColor="#0D1742" />
          <View style={styles.newGradientBackground}>
            {isLoading || isComplete ? (
              <View style={styles.loadingOverlayContainer}>
                <LoadingOverlay
                  isLoading={isLoading}
                  isComplete={isComplete}
                  progress={isComplete ? 100 : progress}
                  loadingText={loadingText}
                  onComplete={handleComplete}
                  returnDeepLink={credentialsRequest?.returnDeepLink}
                  returnAppName={credentialsRequest?.service?.name}
                />
              </View>
            ) : (
              <>
                <ScrollView
                  ref={scrollViewRef}
                  style={styles.scrollView}
                  contentContainerStyle={[
                    styles.scrollViewContent,
                    {
                      paddingBottom: safeAreaInsets.bottom + 24,
                      paddingTop: safeAreaInsets.top,
                    },
                  ]}
                  showsVerticalScrollIndicator={false}
                  onScroll={handleScroll}
                  scrollEventThrottle={16}
                  scrollEnabled={!isSliderActive}
                  onLayout={handleScrollViewLayout}
                  onContentSizeChange={handleContentSizeChange}
                >
                  <>
                    <View style={styles.headerContainer}>
                      {/* Header */}
                      <AccessRequestHeader
                        purpose={credentialsRequest?.service?.purpose || ""}
                        websiteName={credentialsRequest?.service?.name || ""}
                        websiteLogo={credentialsRequest?.service?.logo}
                        websiteDomain={credentialsRequest?.domain || ""}
                        isTrustedDomain={isDomainVerified && !credentialsRequest?.devMode}
                        isDevMode={!!credentialsRequest?.devMode}
                        onBack={handleCancel}
                      />
                    </View>

                    {/* Divider */}
                    <View style={styles.divider} />

                    {/* ID Selected Card - only show if multiple passports */}
                    <IDSelectedCard
                      passport={activePassport!}
                      passports={passports}
                      onSelect={handlePassportSelect}
                    />

                    {/* Privacy Link */}
                    <TouchableOpacity
                      style={styles.privacyLink}
                      onPress={() => setShowPrivacyModal(true)}
                    >
                      <LinearGrad
                        text={t("accessRequest.privacyLinkText")}
                        colors={["#F2DCB0", "#F6D38F"]}
                        // containerStyle={styles.privacyLinkText}
                        textStyle={styles.privacyLinkText}
                      />
                    </TouchableOpacity>

                    <View style={styles.divider} />

                    {/* Verification Criteria */}
                    <VerificationCriteriaList items={criteriaItems} />

                    {/* Unable to Continue Message */}
                    {!allCriteriaPassed && (
                      <View style={styles.unableToContinueContainer}>
                        <UnableToContinue />
                      </View>
                    )}

                    <AccessRequestActions
                      ref={actionsRef}
                      onConfirm={() => {
                        if ((isDomainVerified || credentialsRequest?.devMode) && activePassport) {
                          // Show FaceMatch if requested
                          if (queryResults?.facematch) {
                            onShowFaceMatch()
                            // Start face match timing
                            faceMatchTimerRef.current = createOperationTimer("face_match")
                          } else handleAccept(false)
                        } else {
                          handleDomainNotVerified()
                        }
                      }}
                      onCancel={handleCancel}
                      confirmText={t("continue")}
                      isDomainVerified={isDomainVerified || !!credentialsRequest?.devMode}
                      domainVerifying={domainVerifying}
                      isLoading={!activePassport}
                      canContinue={meetsAllCriteria()}
                      onSlideStart={() => setIsSliderActive(true)}
                      onSlideEnd={() => setIsSliderActive(false)}
                    />
                  </>
                </ScrollView>

                {/* Scroll Down Indicator - fixed at bottom, animates in/out */}
                <Animated.View
                  style={[
                    styles.scrollIndicator,
                    {
                      transform: [
                        {
                          translateY: scrollIndicatorAnim.interpolate({
                            inputRange: [0, 1],
                            outputRange: [90, 0],
                          }),
                        },
                      ],
                    },
                  ]}
                  pointerEvents={isScrolledToBottom ? "none" : "auto"}
                >
                  <LinearGradient
                    colors={["#142262", "#1422627B", "#14226200"]}
                    start={{ x: 0, y: 1 }}
                    end={{ x: 0, y: 0 }}
                    style={styles.scrollIndicatorContent}
                  >
                    <TouchableOpacity onPress={scrollToBottom}>
                      <LinearGradient
                        colors={["#F2DCB0", "#F6D38F"]}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 0, y: 1 }}
                        style={styles.scrollIndicatorIcon}
                      >
                        <ArrowDown size={24} color="#000000" />
                      </LinearGradient>
                    </TouchableOpacity>
                  </LinearGradient>
                </Animated.View>
              </>
            )}
          </View>
        </View>
      )}
    </>
  )
}

const styles = StyleSheet.create({
  fullScreenContainer: {
    flex: 1,
    width: "100%",
  },
  divider: {
    height: 1,
    backgroundColor: "#27315C",
  },
  newGradientBackground: {
    flex: 1,
    width: "100%",
    height: "100%",
    backgroundColor: "#0D1742",
  },
  headerContainer: {
    backgroundColor: "#0D1742",
    marginBottom: 32,
  },
  gradientBackground: {
    flex: 1,
    width: "100%",
    height: "100%",
  },
  scrollView: {
    flex: 1,
  },
  scrollViewContent: {
    paddingTop: Platform.OS === "ios" ? 30 : 70,
    paddingHorizontal: 24,
    paddingBottom: 24, // Increased to account for sticky buttons
    minHeight: Dimensions.get("window").height - 50, // subtract for SafeAreaView padding
  },
  loadingOverlayContainer: {
    flex: 1,
    width: "100%",
    justifyContent: "center",
  },
  container: {
    borderRadius: 30,
    paddingTop: 30,
    paddingHorizontal: 30,
    width: width,
    height: "100%",
    backgroundColor: "transparent",
  },
  unableToContinueContainer: {
    marginBottom: 32,
  },
  privacyLink: {
    alignSelf: "center",
    paddingBottom: 32,
  },
  privacyLinkText: {
    fontSize: 14,
    fontWeight: "500",
    color: "#FFFFFF",
    textDecorationLine: "underline",
  },
  scrollIndicator: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  scrollIndicatorContent: {
    width: "100%",
    height: "100%",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 32,
    justifyContent: "center",
  },
  scrollIndicatorText: {
    fontSize: 18,
    fontWeight: "600",
    color: "#F6D38F",
    marginBottom: 0,
  },
  scrollIndicatorIcon: {
    borderRadius: 9999,
    padding: 16,
  },
})

export default AccessRequestView

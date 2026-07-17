import React, { Component, ErrorInfo, ReactNode } from "react"
import { useError } from "@/context/ErrorContext"
import RNRestart from "react-native-restart"
import { useTranslation } from "react-i18next"
import { useSettings } from "@/context/SettingsContext"
import { PassportViewModel } from "@zkpassport/utils"
import { AlertModal } from "./Modals/AlertModal"

interface ErrorBoundaryProps {
  children: ReactNode
  fallback?: ReactNode
}

interface ErrorBoundaryState {
  hasError: boolean
  error: Error | null
}

class ErrorBoundaryClass extends Component<
  ErrorBoundaryProps & {
    reportError: (error: Error, errorInfo: ErrorInfo) => Promise<void>
    t: (key: string) => string
  },
  ErrorBoundaryState
> {
  constructor(
    props: ErrorBoundaryProps & {
      reportError: (
        error: Error,
        errorInfo: ErrorInfo,
        currentPassport?: PassportViewModel,
      ) => Promise<void>
      t: (key: string) => string
    },
  ) {
    super(props)
    this.state = {
      hasError: false,
      error: null,
    }
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      error,
    }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    // Report the error to our error tracking service
    this.props.reportError(error, errorInfo)
  }

  resetError = (): void => {
    this.setState({
      hasError: false,
      error: null,
    })
  }

  restartApp = (): void => {
    RNRestart.Restart()
  }

  render(): ReactNode {
    const { hasError, error } = this.state
    const { children, fallback, t } = this.props

    if (hasError) {
      if (fallback) {
        console.log("error", error)
        return fallback
      }

      return (
        <AlertModal
          visible={hasError}
          icon={require("@/assets/images/zkpassport-logo.png")}
          iconSize={50}
          title={t("somethingWentWrong")}
          description={t("unexpectedErrorDescription")}
          buttonText={t("tryAgain")}
          buttonText2={t("restartApp")}
          onAccept={this.resetError}
          onClose={this.restartApp}
        />
      )
    }

    return children
  }
}

// Wrapper component to access the ErrorContext
export const ErrorBoundary: React.FC<ErrorBoundaryProps> = (props) => {
  const { reportError } = useError()
  const { t } = useTranslation()
  const { currentPassport } = useSettings()

  // TODO: Is this the proper way to do this?
  // TODO: Adapt the reportError to match expected signature?
  const adaptedReportError = async (error: Error, errorInfo: ErrorInfo): Promise<void> => {
    await reportError(error, errorInfo, currentPassport)
  }

  return <ErrorBoundaryClass {...props} reportError={adaptedReportError} t={t} />
}

export default ErrorBoundary

import React from "react"
import { render, fireEvent } from "@testing-library/react-native"
import EventPage, { EventPageType } from "@/components/Info/EventPage"
import { t } from "i18next"

// Mock the images
jest.mock("@/assets/images/ScanSuccess.png", () => "ScanSuccess")
jest.mock("@/assets/images/SomethingWrong.png", () => "SomethingWrong")
jest.mock("@/assets/images/IDNotSupported.png", () => "IDNotSupported")
jest.mock("@/assets/images/NoWifi.png", () => "NoWifi")

describe("EventPage", () => {
  const mockOnContinue = jest.fn()
  const mockOnSecondary = jest.fn()

  beforeEach(() => {
    jest.clearAllMocks()
    jest.useFakeTimers()
  })

  afterEach(() => {
    jest.runOnlyPendingTimers()
    jest.useRealTimers()
  })

  describe("Rendering - Basic Content", () => {
    it("renders MRZ success content correctly", () => {
      const { getByText } = render(
        <EventPage onContinue={mockOnContinue} stepType={EventPageType.MRZ} />,
      )

      expect(getByText(t("eventPage.title.mrz"))).toBeTruthy()
      expect(getByText(t("eventPage.description.success"))).toBeTruthy()
      expect(getByText(t("continue") + " (5s)")).toBeTruthy()
    })

    it("renders NFC success content correctly", () => {
      const { getByText } = render(
        <EventPage onContinue={mockOnContinue} stepType={EventPageType.NFC} />,
      )

      expect(getByText(t("eventPage.title.nfc"))).toBeTruthy()
      expect(getByText(t("eventPage.description.success"))).toBeTruthy()
    })

    it("renders NFC failed content correctly", () => {
      const { getByText } = render(
        <EventPage onContinue={mockOnContinue} stepType={EventPageType.NFC_FAILED} />,
      )

      expect(getByText(t("eventPage.title.nfcFailed"))).toBeTruthy()
      expect(getByText(t("eventPage.description.nfcFailed"))).toBeTruthy()
      expect(getByText(t("eventPage.secondaryText.useAnotherID"))).toBeTruthy()
      expect(getByText(t("chooseAnotherID"))).toBeTruthy()
    })

    it("renders not supported content correctly", () => {
      const { getByText } = render(
        <EventPage onContinue={mockOnContinue} stepType={EventPageType.NOT_SUPPORTED} />,
      )

      expect(getByText(t("eventPage.title.notSupported"))).toBeTruthy()
      expect(getByText(t("eventPage.description.notSupported"))).toBeTruthy()
      expect(getByText(t("continue"))).toBeTruthy()
    })

    it("renders expired ID content correctly", () => {
      const { getByText } = render(
        <EventPage onContinue={mockOnContinue} stepType={EventPageType.EXPIRED_ID} />,
      )

      expect(getByText(t("eventPage.title.expiredId"))).toBeTruthy()
      expect(getByText(t("eventPage.description.expiredId"))).toBeTruthy()
      expect(getByText(t("chooseAnotherID"))).toBeTruthy()
      expect(getByText(t("close"))).toBeTruthy()
    })

    it("renders something wrong content correctly", () => {
      const { getByText } = render(
        <EventPage onContinue={mockOnContinue} stepType={EventPageType.SOMETHING_WRONG} />,
      )

      expect(getByText(t("eventPage.title.somethingWrong"))).toBeTruthy()
      expect(getByText(t("eventPage.description.somethingWrong"))).toBeTruthy()
      expect(getByText("refreshApp")).toBeTruthy()
    })

    it("renders lost connection content correctly", () => {
      const { getByText } = render(
        <EventPage onContinue={mockOnContinue} stepType={EventPageType.LOST_CONNECTION} />,
      )

      expect(getByText(t("eventPage.title.lostConnection"))).toBeTruthy()
      expect(getByText(t("eventPage.description.lostConnection"))).toBeTruthy()
      expect(getByText(t("eventPage.secondaryText.lostConnection"))).toBeTruthy()
    })

    it("renders verified content correctly", () => {
      const { getByText } = render(
        <EventPage onContinue={mockOnContinue} stepType={EventPageType.VERIFIED} />,
      )

      expect(getByText(t("eventPage.title.verified"))).toBeTruthy()
      expect(getByText(t("eventPage.description.verified"))).toBeTruthy()
    })

    it("renders chip not detected content correctly", () => {
      const { getByText } = render(
        <EventPage onContinue={mockOnContinue} stepType={EventPageType.CHIP_NOT_DETECTED} />,
      )

      expect(getByText(t("eventPage.title.chipNotDetected"))).toBeTruthy()
      expect(getByText(t("eventPage.description.chipNotDetected"))).toBeTruthy()
    })

    it("renders document not supported content correctly", () => {
      const { getByText } = render(
        <EventPage onContinue={mockOnContinue} stepType={EventPageType.DOC_NOT_SUPPORTED} />,
      )

      expect(getByText(t("eventPage.title.docNotSupported"))).toBeTruthy()
      expect(getByText(t("eventPage.description.docNotSupported"))).toBeTruthy()
    })
  })

  describe("Auto-continue functionality", () => {
    it("shows countdown timer for auto-continue events", () => {
      const { getByText } = render(
        <EventPage onContinue={mockOnContinue} stepType={EventPageType.MRZ} initialCountdown={5} />,
      )

      expect(getByText(t("continue") + " (5s)")).toBeTruthy()
    })

    it("does not show countdown for non-auto-continue events", () => {
      const { getByText, queryByText } = render(
        <EventPage onContinue={mockOnContinue} stepType={EventPageType.NFC_FAILED} />,
      )

      expect(getByText(t("chooseAnotherID"))).toBeTruthy()
      expect(queryByText(/\(\d+s\)/)).toBeNull()
    })

    it("does not auto-continue for non-auto-continue events", () => {
      render(<EventPage onContinue={mockOnContinue} stepType={EventPageType.NFC_FAILED} />)

      jest.advanceTimersByTime(10000)

      expect(mockOnContinue).not.toHaveBeenCalled()
    })
  })

  describe("Button interactions", () => {
    it("calls onContinue when primary button is pressed", () => {
      const { getByText } = render(
        <EventPage onContinue={mockOnContinue} stepType={EventPageType.NFC_FAILED} />,
      )

      fireEvent.press(getByText(t("chooseAnotherID")))

      expect(mockOnContinue).toHaveBeenCalledTimes(1)
    })

    it("calls onSecondary when secondary button is pressed", () => {
      // Use EXPIRED_ID which has a secondary button (close)
      const { getByText } = render(
        <EventPage
          onContinue={mockOnContinue}
          onSecondary={mockOnSecondary}
          stepType={EventPageType.EXPIRED_ID}
        />,
      )

      fireEvent.press(getByText(t("close")))

      expect(mockOnSecondary).toHaveBeenCalledTimes(1)
      expect(mockOnContinue).not.toHaveBeenCalled()
    })

    it("calls onContinue as fallback when secondary button is pressed without onSecondary prop", () => {
      const { getByText } = render(
        <EventPage onContinue={mockOnContinue} stepType={EventPageType.NOT_SUPPORTED} />,
      )

      fireEvent.press(getByText(t("continue")))

      expect(mockOnContinue).toHaveBeenCalledTimes(1)
    })

    it("manual button press overrides countdown", async () => {
      const { getByText } = render(
        <EventPage onContinue={mockOnContinue} stepType={EventPageType.MRZ} initialCountdown={5} />,
      )

      // Press button before countdown finishes
      fireEvent.press(getByText(t("continue") + " (5s)"))

      expect(mockOnContinue).toHaveBeenCalledTimes(1)

      // Advance timers to ensure no additional calls
      jest.advanceTimersByTime(10000)

      expect(mockOnContinue).toHaveBeenCalledTimes(1)
    })
  })

  describe("Secondary button rendering", () => {
    it("renders secondary button when defined", () => {
      // Use EXPIRED_ID which has a secondary button (close)
      const { getByText } = render(
        <EventPage onContinue={mockOnContinue} stepType={EventPageType.EXPIRED_ID} />,
      )

      expect(getByText(t("chooseAnotherID"))).toBeTruthy()
      expect(getByText(t("close"))).toBeTruthy()
    })

    it("does not render secondary button when not defined", () => {
      // NOT_SUPPORTED has no secondary button
      const { getByText, queryByText } = render(
        <EventPage onContinue={mockOnContinue} stepType={EventPageType.NOT_SUPPORTED} />,
      )

      expect(getByText(t("continue"))).toBeTruthy()
      expect(queryByText(t("close"))).toBeNull()
    })
  })
})

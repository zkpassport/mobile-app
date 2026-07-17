import MrzScanService from "@/services/MrzScanService"
import { DocumentType } from "@/types/DocumentInfo"
import { PASSPORTS, ID_CARDS, extendedDocumentNumberMRZ, mrzSpecimen } from "../fixtures/passports"

// Mock translation function for tests
const mockT = ((key: string) => {
  const translations: { [key: string]: string } = {
    "errors.documentNumberRequired": "Document number is required",
    "errors.dateOfBirthRequired": "Date of birth is required",
    "errors.dateOfExpiryRequired": "Date of expiry is required",
    "errors.invalidDateFormat": "Invalid date format",
    "errors.invalidDate": "Invalid date",
  }
  return translations[key] || key
}) as any

const john = PASSPORTS.john
const janeDoe = ID_CARDS.janeDoe

describe("MrzScanService", () => {
  let mrzScanService: MrzScanService

  beforeEach(() => {
    mrzScanService = MrzScanService.getInstance()
  })

  describe("instance management", () => {
    it("should return the same instance on multiple calls", () => {
      const instance1 = MrzScanService.getInstance()
      const instance2 = MrzScanService.getInstance()
      expect(instance1).toBe(instance2)
    })

    it("should set error reporting callbacks", () => {
      const mockReportError = jest.fn()

      expect(() => {
        mrzScanService.setErrorReporting(mockReportError)
      }).not.toThrow()
    })
  })

  describe("checksum operations", () => {
    describe("calculateCheckDigit", () => {
      it("should calculate check digits correctly", () => {
        expect(mrzScanService.calculateCheckDigit("12345")).toBe("9")
        expect(mrzScanService.calculateCheckDigit("AB123")).toBe("7")
        expect(mrzScanService.calculateCheckDigit("ZP1111111")).toBe("3")
      })

      it("should handle empty strings", () => {
        expect(mrzScanService.calculateCheckDigit("")).toBe("0")
      })
    })

    describe("verifyChecksum", () => {
      it("should verify correct checksums using fixture data", () => {
        // Test passport document number checksum
        expect(mrzScanService.verifyChecksum(john.passportNumber, 3)).toBe(true)
        expect(mrzScanService.verifyChecksum(john.dateOfBirth, 1)).toBe(true)
        expect(mrzScanService.verifyChecksum(john.passportExpiry, 4)).toBe(true)
      })

      it("should reject incorrect checksums", () => {
        expect(mrzScanService.verifyChecksum(john.passportNumber, 2)).toBe(false)
        expect(mrzScanService.verifyChecksum(john.dateOfBirth, 2)).toBe(false)
        expect(mrzScanService.verifyChecksum(janeDoe.documentNumber, 5)).toBe(false)
      })
    })
  })

  describe("country code extraction", () => {
    describe("getCountryCodeFromMRZ", () => {
      it("should extract country code from valid MRZ", () => {
        expect(mrzScanService.getCountryCodeFromMRZ(john.mrz)).toBe("ZKR")
        expect(mrzScanService.getCountryCodeFromMRZ(janeDoe.mrz)).toBe("ZKR")
      })

      it("should return unknown bad mrz", () => {
        expect(mrzScanService.getCountryCodeFromMRZ("P<U")).toBe("unknown")
        expect(mrzScanService.getCountryCodeFromMRZ("")).toBe("unknown")
        expect(mrzScanService.getCountryCodeFromMRZ("ABC")).toBe("unknown")
        expect(mrzScanService.getCountryCodeFromMRZ(null)).toBe("unknown")
      })
    })
  })

  describe("date formatting", () => {
    describe("formatDateForDisplay", () => {
      it("should format dates with century calculation", () => {
        // These should be interpreted as 20xx dates (future)
        expect(mrzScanService.formatDateForDisplay(john.passportExpiry)).toBe("2035-01-01")
        expect(mrzScanService.formatDateForDisplay(janeDoe.dateOfExpiry)).toBe("2030-01-01")
      })

      it("should handle invalid date lengths, return the date as is", () => {
        expect(mrzScanService.formatDateForDisplay("9511")).toBe("9511")
        expect(mrzScanService.formatDateForDisplay("95111234")).toBe("95111234")
      })
    })
  })

  describe("utility functions", () => {
    describe("padWithChevrons", () => {
      it("should pad short strings with < characters", () => {
        expect(mrzScanService.padWithChevrons(john.passportNumber, 9).length).toBe(9)
        expect(mrzScanService.padWithChevrons(janeDoe.documentNumber, 9).length).toBe(9)
      })

      it("should truncate strings that are too long", () => {
        expect(mrzScanService.padWithChevrons("ABCDEFGHIJK", 9).length).toBe(9)
        expect(mrzScanService.padWithChevrons("1234567890123", 9).length).toBe(9)
      })

      it("handle mrzs that are too short", () => {
        expect(mrzScanService.padWithChevrons("12345", 9).length).toBe(9)
        expect(mrzScanService.padWithChevrons("1234567", 9).length).toBe(9)
      })

      it("should handle empty strings", () => {
        expect(mrzScanService.padWithChevrons("", 9).length).toBe(9)
      })
    })

    describe("formatDateDisplay", () => {
      it("should format valid dates correctly", () => {
        expect(mrzScanService.formatDateDisplay(john.dateOfBirth)).toBe("12/11/95")
        expect(mrzScanService.formatDateDisplay(john.passportExpiry)).toBe("01/01/35")
        expect(mrzScanService.formatDateDisplay(janeDoe.dateOfExpiry)).toBe("01/01/30")
      })

      it("should handle edge cases", () => {
        expect(mrzScanService.formatDateDisplay("991231")).toBe("31/12/99")
        expect(mrzScanService.formatDateDisplay("010101")).toBe("01/01/01")
      })

      it("should return empty string for invalid length", () => {
        expect(mrzScanService.formatDateDisplay("95111")).toBe("")
        expect(mrzScanService.formatDateDisplay("9511123")).toBe("")
        expect(mrzScanService.formatDateDisplay("")).toBe("")
      })

      it("should format even if date values are invalid", () => {
        // The function doesn't validate, just formats
        expect(mrzScanService.formatDateDisplay("991399")).toBe("99/13/99")
        expect(mrzScanService.formatDateDisplay("123456")).toBe("56/34/12")
      })
    })

    describe("getIssuingCountryFromMRZ", () => {
      it("should extract country from passport MRZ", () => {
        const johnMRZ = PASSPORTS.john.mrz
        const result = mrzScanService.getIssuingCountryFromMRZ(johnMRZ)
        expect(result).toBe("ZKR")
      })

      it("should extract country from ID card MRZ", () => {
        const janeMRZ = ID_CARDS.janeDoe.mrz
        const result = mrzScanService.getIssuingCountryFromMRZ(janeMRZ)
        expect(result).toBe("ZKR")
      })

      it("should handle MRZ with newlines", () => {
        const mrzWithNewlines =
          "P<ZKRSMITH<<JOHN<MILLER<<<<<<<<<<<<<<<<<<<<<\nZP1111111_ZKR951112_M350101_<<<<<<<<<<<<<<<"
        const result = mrzScanService.getIssuingCountryFromMRZ(mrzWithNewlines)
        expect(result).toBe("ZKR")
      })

      it("should return null for null/undefined input", () => {
        expect(mrzScanService.getIssuingCountryFromMRZ(null as any)).toBeNull()
        expect(mrzScanService.getIssuingCountryFromMRZ(undefined as any)).toBeNull()
      })

      it("should return null for empty string", () => {
        expect(mrzScanService.getIssuingCountryFromMRZ("")).toBeNull()
      })

      it("should return null for MRZ too short", () => {
        expect(mrzScanService.getIssuingCountryFromMRZ("P<Z")).toBeNull()
      })

      it("should handle MRZ with only spaces/empty lines", () => {
        expect(mrzScanService.getIssuingCountryFromMRZ("   \n  \n")).toBeNull()
      })

      it("should extract from first line even with multiple lines", () => {
        const multiLineMRZ =
          "I<ZKRZID222222<<<<<<<<<<<<<<<<\n9801157F3001018ZKR<<<<<<<<<<<2\nDOE<<JANE<<<<<<<<<<<<<<<<<<<<<"
        const result = mrzScanService.getIssuingCountryFromMRZ(multiLineMRZ)
        expect(result).toBe("ZKR")
      })

      it("should handle different document types", () => {
        const crewCardMRZ = "C<USAJOHNSON<<JANE<<<<<<<<<<<<<<"
        const result = mrzScanService.getIssuingCountryFromMRZ(crewCardMRZ)
        expect(result).toBe("USA")
      })
    })
  })

  describe("MRZ parsing", () => {
    describe("extractMrzData", () => {
      describe("passport format (TD3)", () => {
        const johnMRZ = PASSPORTS.john.mrz

        it("should extract correct data from valid passport MRZ", () => {
          const result = mrzScanService.extractMrzData(johnMRZ, DocumentType.PASSPORT)
          expect(result).toEqual({
            documentNumber: "ZP1111111",
            dateOfBirth: "951112",
            dateOfExpiry: "350101",
          })
        })

        it("should handle MRZ with whitespace", () => {
          const mrzWithSpaces = johnMRZ.slice(0, 44) + " \n " + johnMRZ.slice(44)
          const result = mrzScanService.extractMrzData(mrzWithSpaces, DocumentType.PASSPORT)
          expect(result).toEqual({
            documentNumber: "ZP1111111",
            dateOfBirth: "951112",
            dateOfExpiry: "350101",
          })
        })

        it("should return null for invalid passport MRZ length", () => {
          const invalidMRZ = johnMRZ.slice(0, 80) // Too short
          const result = mrzScanService.extractMrzData(invalidMRZ, DocumentType.PASSPORT)
          expect(result).toBeNull()
        })

        it("should return null for non-passport prefix", () => {
          const invalidMRZ = "I" + johnMRZ.slice(1)
          const result = mrzScanService.extractMrzData(invalidMRZ, DocumentType.PASSPORT)
          expect(result).toBeNull()
        })

        it("should detect and swap swapped TD3 lines (second line misread as first)", () => {
          // Create a valid TD3 MRZ
          const validMRZ = john.mrz
          const firstLine = validMRZ.slice(0, 44)
          const secondLine = validMRZ.slice(44)

          // Swap the lines to simulate the error
          const swappedMRZ = secondLine + firstLine // Now second line is first

          const unswappedMRZ = mrzScanService.detectAndSwapTD3Lines(swappedMRZ)

          expect(unswappedMRZ).toBe(validMRZ)
        })

        it("should not swap correctly ordered TD3 lines", () => {
          // Normal case - lines in correct order
          const result = mrzScanService.extractMrzData(john.mrz, DocumentType.PASSPORT)

          expect(result).toEqual({
            documentNumber: john.passportNumber,
            dateOfBirth: john.dateOfBirth,
            dateOfExpiry: john.passportExpiry,
          })
        })
      })

      describe("ID card format (TD1)", () => {
        const janeMRZ = ID_CARDS.janeDoe.mrz

        it("should extract correct data from valid ID card MRZ", () => {
          const result = mrzScanService.extractMrzData(janeMRZ, DocumentType.ID_CARD)
          expect(result).toEqual({
            documentNumber: "ZID222222",
            dateOfBirth: "980115",
            dateOfExpiry: "300101",
          })
        })

        it("should handle extended document numbers", () => {
          // Create an MRZ with extended document number (check digit is <)
          const extendedDocMRZ =
            "I<ZKRABC123456<EXTENDED123456<" +
            "9801157F3001018ZKR<<<<<<<<<<<2" +
            "DOE<<JANE<<<<<<<<<<<<<<<<<<<<<"

          const result = mrzScanService.extractMrzData(extendedDocMRZ, DocumentType.ID_CARD)
          expect(result?.documentNumber).toBe("ABC123456EXTENDED12345")
        })

        it("should return null for invalid ID card MRZ length", () => {
          const invalidMRZ = janeMRZ.slice(0, 80) // Too short
          const result = mrzScanService.extractMrzData(invalidMRZ, DocumentType.ID_CARD)
          expect(result).toBeNull()
        })

        it("should handle other document types (A, C prefixes)", () => {
          const crewCardMRZ = "C" + janeMRZ.slice(1)
          const result = mrzScanService.extractMrzData(crewCardMRZ, DocumentType.ID_CARD)
          expect(result).toEqual({
            documentNumber: "ZID222222",
            dateOfBirth: "980115",
            dateOfExpiry: "300101",
          })
        })
      })

      it("should return null for malformed MRZ", () => {
        const result = mrzScanService.extractMrzData("invalid", DocumentType.PASSPORT)
        expect(result).toBeNull()
      })

      it("should handle extraction errors gracefully", () => {
        // Simulate an error by providing an MRZ that might cause slice to fail
        const result = mrzScanService.extractMrzData("", DocumentType.PASSPORT)
        expect(result).toBeNull()
      })
    })
  })

  describe("validation", () => {
    describe("validateInputs", () => {
      it("should validate correct inputs", () => {
        const result = mrzScanService.validateInputs("ZP1111111", "951112", "350101", mockT)
        expect(result.isValid).toBe(true)
        expect(result.errors).toEqual({
          documentNumber: "",
          dateOfBirth: "",
          dateOfExpiry: "",
        })
      })

      describe("document number validation", () => {
        it("should require document number", () => {
          const result = mrzScanService.validateInputs("", "951112", "350101", mockT)
          expect(result.isValid).toBe(false)
          expect(result.errors.documentNumber).toBe("Document number is required")
        })

        it("should not reject document numbers that are longer than 9 characters", () => {
          const result = mrzScanService.validateInputs("1234567890", "951112", "350101", mockT)
          expect(result.isValid).toBe(true)
        })

        it("should accept document numbers exactly at limit", () => {
          const result = mrzScanService.validateInputs("123456789", "951112", "350101", mockT)
          expect(result.isValid).toBe(true)
        })
      })

      describe("date of birth validation", () => {
        it("should require date of birth", () => {
          const result = mrzScanService.validateInputs("ZP1111111", "", "350101", mockT)
          expect(result.isValid).toBe(false)
          expect(result.errors.dateOfBirth).toBe("Date of birth is required")
        })

        it("should reject invalid date format", () => {
          const result = mrzScanService.validateInputs("ZP1111111", "9511", "350101", mockT)
          expect(result.isValid).toBe(false)
          expect(result.errors.dateOfBirth).toBe("Invalid date format")
        })

        it("should reject invalid months", () => {
          const result = mrzScanService.validateInputs("ZP1111111", "951312", "350101", mockT)
          expect(result.isValid).toBe(false)
          expect(result.errors.dateOfBirth).toBe("Invalid date")
        })

        it("should reject invalid days", () => {
          const result = mrzScanService.validateInputs("ZP1111111", "951132", "350101", mockT)
          expect(result.isValid).toBe(false)
          expect(result.errors.dateOfBirth).toBe("Invalid date")
        })

        it("should accept valid edge dates", () => {
          const result1 = mrzScanService.validateInputs("ZP1111111", "950101", "350101", mockT)
          expect(result1.isValid).toBe(true)

          const result2 = mrzScanService.validateInputs("ZP1111111", "951231", "350101", mockT)
          expect(result2.isValid).toBe(true)
        })
      })

      describe("date of expiry validation", () => {
        it("should require date of expiry", () => {
          const result = mrzScanService.validateInputs("ZP1111111", "951112", "", mockT)
          expect(result.isValid).toBe(false)
          expect(result.errors.dateOfExpiry).toBe("Date of expiry is required")
        })

        it("should reject invalid date format", () => {
          const result = mrzScanService.validateInputs("ZP1111111", "951112", "350", mockT)
          expect(result.isValid).toBe(false)
          expect(result.errors.dateOfExpiry).toBe("Invalid date format")
        })

        it("should reject invalid months", () => {
          const result = mrzScanService.validateInputs("ZP1111111", "951112", "351301", mockT)
          expect(result.isValid).toBe(false)
          expect(result.errors.dateOfExpiry).toBe("Invalid date")
        })

        it("should reject invalid days", () => {
          const result = mrzScanService.validateInputs("ZP1111111", "951112", "350132", mockT)
          expect(result.isValid).toBe(false)
          expect(result.errors.dateOfExpiry).toBe("Invalid date")
        })

        it("should handle multiple validation errors", () => {
          const result = mrzScanService.validateInputs("", "9511", "35", mockT)
          expect(result.isValid).toBe(false)
          expect(result.errors.documentNumber).toBe("Document number is required")
          expect(result.errors.dateOfBirth).toBe("Invalid date format")
          expect(result.errors.dateOfExpiry).toBe("Invalid date format")
        })
      })
    })
  })

  describe("MRZ construction", () => {
    describe("constructMrzFromManualInput", () => {
      describe("passport", () => {
        let mrz: string

        it("should construct a valid MRZ", () => {
          mrz = mrzScanService.constructMrzFromManualInput(
            john.passportNumber,
            john.dateOfBirth,
            john.passportExpiry,
            DocumentType.PASSPORT,
          )
          expect(mrz).toBeDefined()
          const lines = mrz.split("\n")
          expect(lines).toHaveLength(2)
          expect(lines[0]).toHaveLength(44)
          expect(lines[1]).toHaveLength(44)

          // validate the inputs
          const parsedMrz = mrzScanService.parseMRZ(mrz)
          expect(parsedMrz?.documentNumber).toBe(john.passportNumber)
          expect(parsedMrz?.dateOfBirth).toBe(john.dateOfBirth)
          expect(parsedMrz?.dateOfExpiry).toBe(john.passportExpiry)
        })

        it("should preserve document data correctly", () => {
          const parsedMrz = mrzScanService.parseMRZ(mrz)
          expect(parsedMrz?.documentNumber).toBe(john.passportNumber)
          expect(parsedMrz?.dateOfBirth).toBe(john.dateOfBirth)
          expect(parsedMrz?.dateOfExpiry).toBe(john.passportExpiry)
        })

        describe("edge cases", () => {
          it("should handle short document numbers by padding with <", () => {
            const shortDocNum = "AB123"
            const mrz = mrzScanService.constructMrzFromManualInput(
              shortDocNum,
              john.dateOfBirth,
              john.passportExpiry,
              DocumentType.PASSPORT,
            )
            const parsedMrz = mrzScanService.parseMRZ(mrz)
            expect(parsedMrz?.documentNumber).toBe(shortDocNum)
          })

          it("should handle extended document numbers in ID cards", () => {
            const mrz = extendedDocumentNumberMRZ
            const parsedMrz = mrzScanService.parseMRZ(mrz)
            expect(parsedMrz?.documentNumber).toBe("007666667ZZ0")
            expect(parsedMrz?.dateOfBirth).toBe("830314")
            expect(parsedMrz?.dateOfExpiry).toBe("340529")
          })

          it("should handle manual entry for extended document numbers", () => {
            const mrz = mrzScanService.constructMrzFromManualInput(
              "007666667ZZ0",
              "830314",
              "340529",
              DocumentType.ID_CARD,
            )
            const parsedMrz = mrzScanService.parseMRZ(mrz)
            // for manual entry, only the first 9 characters are used to derive key for nfc chip
            expect(parsedMrz?.documentNumber).toBe("007666667")
            expect(parsedMrz?.dateOfBirth).toBe("830314")
            expect(parsedMrz?.dateOfExpiry).toBe("340529")
          })

          it("should handle extended document numbers in Norwegian specimenID cards", () => {
            const mrz = mrzSpecimen
            console.log(mrz)
            const parsedMrz = mrzScanService.parseMRZ(mrz)
            expect(parsedMrz?.documentNumber).toBe("GDC000127")
            expect(parsedMrz?.dateOfBirth).toBe("560423")
            expect(parsedMrz?.dateOfExpiry).toBe("260611")
          })

          it("should fail parsing with invalid dates", () => {
            const mrz = mrzScanService.constructMrzFromManualInput(
              john.passportNumber,
              "9999999",
              john.passportExpiry,
              DocumentType.PASSPORT,
            )
            const parsedMrz = mrzScanService.parseMRZ(mrz)
            expect(parsedMrz).toBeNull()
          })

          it("should fail parsing with incorrect date format", () => {
            const mrz = mrzScanService.constructMrzFromManualInput(
              john.passportNumber,
              "95111",
              john.passportExpiry,
              DocumentType.PASSPORT,
            )
            const parsedMrz = mrzScanService.parseMRZ(mrz)
            expect(parsedMrz).toBeNull()
          })
        })
      })

      describe("ID card", () => {
        let mrz: string

        it("should construct a valid MRZ with 3 lines", () => {
          mrz = mrzScanService.constructMrzFromManualInput(
            janeDoe.documentNumber,
            janeDoe.dateOfBirth,
            janeDoe.dateOfExpiry,
            DocumentType.ID_CARD,
          )
          expect(mrz).toBeDefined()
          const lines = mrz.split("\n")
          expect(lines).toHaveLength(3)
          expect(lines[0]).toHaveLength(30)
          expect(lines[1]).toHaveLength(30)
          expect(lines[2]).toHaveLength(30)

          // validate the inputs
          const parsedMrz = mrzScanService.parseMRZ(mrz)
          expect(parsedMrz?.documentNumber).toBe(janeDoe.documentNumber)
          expect(parsedMrz?.dateOfBirth).toBe(janeDoe.dateOfBirth)
          expect(parsedMrz?.dateOfExpiry).toBe(janeDoe.dateOfExpiry)
        })

        it("should preserve document data correctly", () => {
          const parsedMrz = mrzScanService.parseMRZ(mrz)
          expect(parsedMrz?.documentNumber).toBe(janeDoe.documentNumber)
          expect(parsedMrz?.dateOfBirth).toBe(janeDoe.dateOfBirth)
          expect(parsedMrz?.dateOfExpiry).toBe(janeDoe.dateOfExpiry)
        })

        describe("edge cases", () => {
          it("should handle alphanumeric document numbers", () => {
            const alphaNumDoc = "ABC123XYZ"
            const mrz = mrzScanService.constructMrzFromManualInput(
              alphaNumDoc,
              janeDoe.dateOfBirth,
              janeDoe.dateOfExpiry,
              DocumentType.ID_CARD,
            )
            const parsedMrz = mrzScanService.parseMRZ(mrz)
            expect(parsedMrz?.documentNumber).toBe(alphaNumDoc)
          })

          it("should handle empty document number", () => {
            const mrz = mrzScanService.constructMrzFromManualInput(
              "",
              janeDoe.dateOfBirth,
              janeDoe.dateOfExpiry,
              DocumentType.ID_CARD,
            )
            const parsedMrz = mrzScanService.parseMRZ(mrz)
            expect(parsedMrz?.documentNumber).toBe("")
          })

          it("should fail parsing with malformed MRZ", () => {
            const malformedMrz = "I<ZKRABC"
            const parsedMrz = mrzScanService.parseMRZ(malformedMrz)
            expect(parsedMrz).toBeNull()
          })

          it("should handle special characters in document number", () => {
            const specialDoc = "A-B/C.123"
            const mrz = mrzScanService.constructMrzFromManualInput(
              specialDoc,
              janeDoe.dateOfBirth,
              janeDoe.dateOfExpiry,
              DocumentType.ID_CARD,
            )
            const lines = mrz.split("\n")
            // Special characters should be preserved in the MRZ
            expect(lines[0]).toContain(specialDoc)
          })
        })
      })
    })
  })

  describe("duplicate detection", () => {
    describe("isDuplicateMrz", () => {
      const testMrz = john.mrz // John's MRZ from fixtures
      const differentMrz = janeDoe.mrz // Jane's MRZ from fixtures

      it("should return false when no existing MRZs", async () => {
        const getMrzs = jest.fn().mockResolvedValue([])
        const result = await mrzScanService.isDuplicateMrz(testMrz, getMrzs)
        expect(result).toBe(false)
        expect(getMrzs).toHaveBeenCalledTimes(1)
      })

      it("should return false when MRZ is unique", async () => {
        const getMrzs = jest.fn().mockResolvedValue([differentMrz])
        const result = await mrzScanService.isDuplicateMrz(testMrz, getMrzs)
        expect(result).toBe(false)
      })

      it("should return true when exact duplicate exists", async () => {
        const getMrzs = jest.fn().mockResolvedValue([testMrz])
        const result = await mrzScanService.isDuplicateMrz(testMrz, getMrzs)
        expect(result).toBe(true)
      })

      it("should return true when duplicate exists among multiple MRZs", async () => {
        const getMrzs = jest.fn().mockResolvedValue([differentMrz, testMrz, differentMrz])
        const result = await mrzScanService.isDuplicateMrz(testMrz, getMrzs)
        expect(result).toBe(true)
      })

      it("should return false when document number differs", async () => {
        // Create MRZ with same DOB and expiry but different document number
        const modifiedMrz = mrzScanService.constructMrzFromManualInput(
          "ZP9999999", // Different document number
          john.dateOfBirth,
          john.passportExpiry,
          DocumentType.PASSPORT,
        )
        const getMrzs = jest.fn().mockResolvedValue([testMrz])
        const result = await mrzScanService.isDuplicateMrz(modifiedMrz, getMrzs)
        expect(result).toBe(false)
      })

      it("should return false when date of birth differs", async () => {
        // Create MRZ with same doc number and expiry but different DOB
        const modifiedMrz = mrzScanService.constructMrzFromManualInput(
          john.passportNumber,
          "900101", // Different DOB
          john.passportExpiry,
          DocumentType.PASSPORT,
        )
        const getMrzs = jest.fn().mockResolvedValue([testMrz])
        const result = await mrzScanService.isDuplicateMrz(modifiedMrz, getMrzs)
        expect(result).toBe(false)
      })

      it("should return false when date of expiry differs", async () => {
        // Create MRZ with same doc number and DOB but different expiry
        const modifiedMrz = mrzScanService.constructMrzFromManualInput(
          john.passportNumber,
          john.dateOfBirth,
          "400101", // Different expiry
          DocumentType.PASSPORT,
        )
        const getMrzs = jest.fn().mockResolvedValue([testMrz])
        const result = await mrzScanService.isDuplicateMrz(modifiedMrz, getMrzs)
        expect(result).toBe(false)
      })

      it("should return false when input MRZ cannot be parsed", async () => {
        const invalidMrz = "INVALID_MRZ"
        const getMrzs = jest.fn().mockResolvedValue([testMrz])
        const result = await mrzScanService.isDuplicateMrz(invalidMrz, getMrzs)
        expect(result).toBe(false)
      })

      it("should handle empty string MRZ gracefully", async () => {
        const getMrzs = jest.fn().mockResolvedValue([testMrz])
        const result = await mrzScanService.isDuplicateMrz("", getMrzs)
        expect(result).toBe(false)
      })

      it("should work with ID card MRZs", async () => {
        const idCardMrz = janeDoe.mrz
        const getMrzs = jest.fn().mockResolvedValue([idCardMrz])
        const result = await mrzScanService.isDuplicateMrz(idCardMrz, getMrzs)
        expect(result).toBe(true)
      })

      it("should detect ID card duplicates with different names but same credentials", async () => {
        const idCardMrz1 = janeDoe.mrz
        // Create another ID card with same doc number, DOB, and expiry but different name
        const idCardMrz2 = mrzScanService.constructMrzFromManualInput(
          janeDoe.documentNumber,
          janeDoe.dateOfBirth,
          janeDoe.dateOfExpiry,
          DocumentType.ID_CARD,
        )
        const getMrzs = jest.fn().mockResolvedValue([idCardMrz1])
        const result = await mrzScanService.isDuplicateMrz(idCardMrz2, getMrzs)
        expect(result).toBe(true)
      })

      it("should find duplicate in large array", async () => {
        // Create 100 MRZs with the target MRZ in the middle
        const largeMrzArray = Array.from({ length: 50 }, (_, i) =>
          mrzScanService.constructMrzFromManualInput(
            `ZP${String(i).padStart(7, "0")}`,
            john.dateOfBirth,
            john.passportExpiry,
            DocumentType.PASSPORT,
          ),
        )
        largeMrzArray.push(testMrz) // Add duplicate in the middle
        largeMrzArray.push(
          ...Array.from({ length: 49 }, (_, i) =>
            mrzScanService.constructMrzFromManualInput(
              `ZP${String(i + 50).padStart(7, "0")}`,
              john.dateOfBirth,
              john.passportExpiry,
              DocumentType.PASSPORT,
            ),
          ),
        )

        const getMrzs = jest.fn().mockResolvedValue(largeMrzArray)
        const result = await mrzScanService.isDuplicateMrz(testMrz, getMrzs)
        expect(result).toBe(true)
      })

      describe("edge cases with whitespace and formatting", () => {
        it("should handle MRZ with extra whitespace", async () => {
          const mrzWithWhitespace = testMrz.replace(/\n/g, "\n ")
          const getMrzs = jest.fn().mockResolvedValue([testMrz])
          const result = await mrzScanService.isDuplicateMrz(mrzWithWhitespace, getMrzs)
          expect(result).toBe(true)
        })
      })

      describe("extended document numbers", () => {
        it("should detect duplicates with extended document numbers", async () => {
          const extendedMrz = extendedDocumentNumberMRZ
          const getMrzs = jest.fn().mockResolvedValue([extendedMrz])
          const result = await mrzScanService.isDuplicateMrz(extendedMrz, getMrzs)
          expect(result).toBe(true)
        })
      })
    })
  })

  describe("expiry detection", () => {
    describe("isExpired", () => {
      it("should return false for valid future expiry date", () => {
        // John's passport expires in 2035
        const result = mrzScanService.isExpired(john.mrz)
        expect(result).toBe(false)
      })

      it("should return false for expiry date today", () => {
        const today = new Date()
        const yy = String(today.getFullYear() % 100).padStart(2, "0")
        const mm = String(today.getMonth() + 1).padStart(2, "0")
        const dd = String(today.getDate()).padStart(2, "0")
        const todayDate = `${yy}${mm}${dd}`

        const todayMrz = mrzScanService.constructMrzFromManualInput(
          john.passportNumber,
          john.dateOfBirth,
          todayDate,
          DocumentType.PASSPORT,
        )
        const result = mrzScanService.isExpired(todayMrz)
        expect(result).toBe(false)
      })

      it("should return true for expiry date in the past", () => {
        // Create MRZ with expiry date of January 1, 2020
        const pastExpiryMrz = mrzScanService.constructMrzFromManualInput(
          john.passportNumber,
          john.dateOfBirth,
          "200101", // January 1, 2020
          DocumentType.PASSPORT,
        )
        const result = mrzScanService.isExpired(pastExpiryMrz)
        expect(result).toBe(true)
      })

      it("should return true for expiry date yesterday", () => {
        const yesterday = new Date()
        yesterday.setDate(yesterday.getDate() - 1)
        const yy = String(yesterday.getFullYear() % 100).padStart(2, "0")
        const mm = String(yesterday.getMonth() + 1).padStart(2, "0")
        const dd = String(yesterday.getDate()).padStart(2, "0")
        const yesterdayDate = `${yy}${mm}${dd}`

        const yesterdayMrz = mrzScanService.constructMrzFromManualInput(
          john.passportNumber,
          john.dateOfBirth,
          yesterdayDate,
          DocumentType.PASSPORT,
        )
        const result = mrzScanService.isExpired(yesterdayMrz)
        expect(result).toBe(true)
      })

      it("should return false when MRZ cannot be parsed", () => {
        const invalidMrz = "INVALID_MRZ"
        const result = mrzScanService.isExpired(invalidMrz)
        expect(result).toBe(false)
      })

      it("should return false for empty string MRZ", () => {
        const result = mrzScanService.isExpired("")
        expect(result).toBe(false)
      })

      it("should return false when date of expiry is missing", () => {
        // Create a mock MRZ that will parse but have no dateOfExpiry
        // This is edge case handling - parseMRZ should always return dateOfExpiry
        // but we test the safety check
        const mrzWithoutExpiry =
          "P<ZKRTEST<<TEST<<<<<<<<<<<<<<<<<<<<<<<<<<<<\nZP11111113ZKR9511121M<<<<<<<<<<<<<<<<<<<4"
        const result = mrzScanService.isExpired(mrzWithoutExpiry)
        expect(result).toBe(false)
      })

      it("should return false when date of expiry has invalid length", () => {
        // This tests the length validation in isExpired
        // In practice, parseMRZ should always return 6-char dates or null
        const shortExpiryMrz =
          "P<ZKRTEST<<TEST<<<<<<<<<<<<<<<<<<<<<<<<<<<<\nZP11111113ZKR9511121M35010<<<<<<<<<<<<<<<<4"
        const result = mrzScanService.isExpired(shortExpiryMrz)
        // Should return false because the expiry date length check will fail
        expect(result).toBe(false)
      })

      it("should work with ID card MRZs", () => {
        // Jane's ID card expires in 2030
        const result = mrzScanService.isExpired(janeDoe.mrz)
        expect(result).toBe(false)
      })

      it("should detect expired ID cards", () => {
        const expiredIdCardMrz = mrzScanService.constructMrzFromManualInput(
          janeDoe.documentNumber,
          janeDoe.dateOfBirth,
          "200101", // January 1, 2020
          DocumentType.ID_CARD,
        )
        const result = mrzScanService.isExpired(expiredIdCardMrz)
        expect(result).toBe(true)
      })

      it("should handle edge case: expiry at year boundary", () => {
        // Test Dec 31, 2020 (past)
        const dec31Mrz = mrzScanService.constructMrzFromManualInput(
          john.passportNumber,
          john.dateOfBirth,
          "201231",
          DocumentType.PASSPORT,
        )
        expect(mrzScanService.isExpired(dec31Mrz)).toBe(true)

        // Test Jan 1, 2050 (future)
        const jan1Mrz = mrzScanService.constructMrzFromManualInput(
          john.passportNumber,
          john.dateOfBirth,
          "500101",
          DocumentType.PASSPORT,
        )
        expect(mrzScanService.isExpired(jan1Mrz)).toBe(false)
      })

      it("should handle century cutoff correctly", () => {
        // Dates in the 00-29 range are interpreted as 20xx
        const year25Mrz = mrzScanService.constructMrzFromManualInput(
          john.passportNumber,
          john.dateOfBirth,
          "250101",
          DocumentType.PASSPORT,
        )
        expect(mrzScanService.isExpired(year25Mrz)).toBe(true) // 2025-01-01 is in the past

        // Dates in the 30-99 range are interpreted as 19xx
        const year99Mrz = mrzScanService.constructMrzFromManualInput(
          john.passportNumber,
          john.dateOfBirth,
          "990101",
          DocumentType.PASSPORT,
        )
        expect(mrzScanService.isExpired(year99Mrz)).toBe(true) // 1999-01-01 is definitely expired
      })
    })
  })
})

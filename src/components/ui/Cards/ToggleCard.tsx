import { StyleSheet, Switch, Text, View } from "react-native"

interface ToggleCardProps {
  title: string
  description: string | React.ReactNode
  value: boolean
  onChange: (value: boolean) => void
  disabled?: boolean
}

export const ToggleCard: React.FC<ToggleCardProps> = ({
  title,
  description,
  value,
  onChange,
  disabled,
}) => {
  return (
    <View style={styles.eventReportingCard}>
      <View style={styles.eventReportingContentTop}>
        <View style={styles.eventReportingHeader}>
          <Text style={styles.eventReportingTitle}>{title}</Text>
        </View>
        <Switch
          disabled={disabled}
          value={value || false}
          onValueChange={onChange}
          trackColor={{ false: "#DBDFF3", true: "#F6D38F" }}
          thumbColor={value ? "#000000" : "#022964"}
        />
      </View>

      <Text style={styles.eventReportingDescription}>{description}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  eventReportingCard: {
    backgroundColor: "rgba(59, 91, 152, 0.3)",
    borderRadius: 8,
    padding: 16,
  },
  eventReportingHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  eventReportingContentTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingBottom: 16,
    paddingRight: 10,
  },
  eventReportingTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#FBFBFB",
    // fontFamily: "Inter",
    marginBottom: 4,
  },
  eventReportingDescription: {
    fontSize: 12,
    fontWeight: "400",
    color: "#B8C5E0",
    // fontFamily: "Inter",
    lineHeight: 18,
  },
})

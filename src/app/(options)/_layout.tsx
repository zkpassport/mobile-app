import { Stack } from "expo-router"

export default function OptionsLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        animation: "none", // Disable animations for all options screens
        contentStyle: {
          backgroundColor: "#07245C",
        },
      }}
    >
      <Stack.Screen name="options" />
      <Stack.Screen name="settings" />
      <Stack.Screen name="technical-info" />
      <Stack.Screen name="whats-next" />
      <Stack.Screen name="developer-options" />
      <Stack.Screen name="security" />
    </Stack>
  )
}

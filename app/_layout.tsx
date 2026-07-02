import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";

const BG = "#101418";

export default function RootLayout() {
  return (
    <>
      {/* Light icons/text for the dark background. On Android edge-to-edge the
          status bar is transparent, so the dark header/SafeAreaView shows through. */}
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: BG },
          headerTintColor: "#fff",
          headerShadowVisible: false,
          contentStyle: { backgroundColor: BG },
        }}
      />
    </>
  );
}

import { Image } from "expo-image";
import { memo, useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";

type LazyCategoryCardArtworkProps = {
  uri: string;
  shouldLoad: boolean;
};

function LazyCategoryCardArtwork({
  uri,
  shouldLoad,
}: LazyCategoryCardArtworkProps) {
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [uri]);

  if (!shouldLoad || failed) {
    return null;
  }

  return (
    <View style={styles.layer} pointerEvents="none">
      <Image
        source={{ uri }}
        style={styles.image}
        contentFit="cover"
        cachePolicy="disk"
        recyclingKey={uri}
        transition={120}
        onError={() => setFailed(true)}
      />
      <View style={styles.scrim} />
    </View>
  );
}

export default memo(LazyCategoryCardArtwork);

const styles = StyleSheet.create({
  layer: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 0,
  },
  image: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0.34,
  },
  scrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.42)",
  },
});

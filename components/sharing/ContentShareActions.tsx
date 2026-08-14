import { useCallback, useMemo } from 'react';
import { AccessibilityInfo, Alert, Share, StyleSheet, Text, TouchableOpacity, View, type GestureResponderEvent } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { Ionicons } from '@expo/vector-icons';

import { COLORS } from '@/constants/theme';
import { canonicalUrlForContent, shareMessageForContent, type ShareableContent } from '@/utils/contentSharing';

type Props = { content: ShareableContent; compact?: boolean; menu?: boolean };

export default function ContentShareActions({ content, compact = false, menu = false }: Props) {
  const url = useMemo(() => {
    try { return canonicalUrlForContent(content); } catch { return ''; }
  }, [content]);
  const copyLink = useCallback(async () => {
    if (!url) return;
    try {
      await Clipboard.setStringAsync(url);
      AccessibilityInfo.announceForAccessibility('Link copied');
      Alert.alert('Link copied', 'The Hidden Tunes link is ready to paste.');
    } catch {
      Alert.alert('Could not copy link', 'Please try again.');
    }
  }, [url]);

  const shareLink = useCallback(async () => {
    if (!url) return;
    try {
      await Share.share({
        title: content.title.trim() || 'Hidden Tunes',
        message: shareMessageForContent(content),
        url,
      });
    } catch {
      Alert.alert('Could not share', 'Please try again.');
    }
  }, [content, url]);

  const openMenu = useCallback((event: GestureResponderEvent) => {
    event.stopPropagation();
    if (!url) return;
    Alert.alert(content.title, undefined, [
      { text: 'Copy Link', onPress: () => void copyLink() },
      { text: 'Share', onPress: () => void shareLink() },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }, [content.title, copyLink, shareLink, url]);

  if (menu) {
    return (
      <TouchableOpacity accessibilityRole="button" accessibilityLabel={`Share ${content.title}`} disabled={!url} onPress={openMenu} style={styles.menuButton} hitSlop={8}>
        <Ionicons name="ellipsis-horizontal" size={20} color={COLORS.text} />
      </TouchableOpacity>
    );
  }

  return (
    <View style={[styles.actions, compact && styles.actionsCompact]} accessibilityRole="toolbar">
      <TouchableOpacity accessibilityRole="button" accessibilityLabel={`Copy link to ${content.title}`} disabled={!url} onPress={copyLink} style={[styles.action, compact && styles.actionCompact]}>
        <Ionicons name="link-outline" size={18} color={COLORS.text} />
        {!compact && <Text style={styles.label}>Copy Link</Text>}
      </TouchableOpacity>
      <TouchableOpacity accessibilityRole="button" accessibilityLabel={`Share ${content.title}`} disabled={!url} onPress={shareLink} style={[styles.action, compact && styles.actionCompact]}>
        <Ionicons name="share-outline" size={18} color={COLORS.text} />
        {!compact && <Text style={styles.label}>Share</Text>}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  actions: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 12 },
  actionsCompact: { marginTop: 0, gap: 4 },
  action: { minHeight: 44, paddingHorizontal: 14, borderRadius: 22, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, backgroundColor: 'rgba(255,255,255,0.12)', borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.24)' },
  actionCompact: { width: 44, paddingHorizontal: 0 },
  menuButton: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  label: { color: COLORS.text, fontSize: 14, fontWeight: '600' },
});

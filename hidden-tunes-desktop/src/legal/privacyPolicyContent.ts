export const PRIVACY_POLICY_META = {
  productName: 'Hidden Tunes',
  packageId: 'com.hiddentunes.app',
  canonicalUrl: 'https://hiddentunes.com/privacy',
  contactEmail: 'support [at] hiddentunes.com',
  effectiveDate: '17 August 2026',
} as const

export const PRIVACY_POLICY_SECTIONS: ReadonlyArray<{
  id: string
  title: string
  paragraphs: readonly string[]
}> = [
  {
    id: 'who',
    title: 'Who we are',
    paragraphs: [
      'This Privacy Policy describes how Hidden Tunes collects, uses, shares, stores, and deletes information when you use the Hidden Tunes applications and website.',
      'Hidden Tunes is an entertainment app for music, global radio, podcasts, audiobooks, TV, and related listening features. The Android application package name is com.hiddentunes.app.',
      'This page is the canonical public policy for Hidden Tunes. Effective date: 17 August 2026.',
    ],
  },
  {
    id: 'accounts',
    title: 'Accounts and authentication',
    paragraphs: [
      'You can browse much of Hidden Tunes without creating an account. Sign-in is optional and is used for features such as artist Follow and Cross Play progress.',
      'When you create or use an account, Hidden Tunes uses Supabase Authentication. That service receives the email address you submit and, if you choose password sign-in, your password. We also support email magic-link / one-time-code sign-in and password reset.',
      'Signed-in sessions are stored on your device so you remain signed in. The account has a user identifier issued by Supabase. We do not use your password for any purpose other than authentication.',
    ],
  },
  {
    id: 'collected',
    title: 'Information we collect',
    paragraphs: [
      'Account data, if you sign in: email address, authentication tokens, and the account user identifier.',
      'Follow data, if you are signed in and follow or unfollow an artist: the artist you followed and the fact that your account followed them.',
      'Playback and activity data on the device: playback position, queue, favorites, playlists, downloads you save, search terms and short-lived search-result caches, radio/TV/podcast/audiobook browse requests, and similar library history.',
      'Optional Cross Play data, if that feature runs while you are signed in: a device installation identifier, a device name, and in-progress playback position so you can continue on another signed-in device.',
      'Creator uploads, only if you use Artist Submissions or an upload tool and pick a file: the file you choose and related submission metadata.',
      'WebView data, only if you play certain YouTube, TV, or sports sources: cookies or local storage created by the site loaded in the in-app WebView, according to that site’s own policy.',
      'Approximate technical information needed to complete a request, such as IP address seen by our HTTPS servers, is processed as part of ordinary web/API traffic. We do not operate a separate advertising analytics SDK in the current Android app.',
    ],
  },
  {
    id: 'not-collected',
    title: 'Information we do not collect in the current Android app',
    paragraphs: [
      'Hidden Tunes does not require camera, microphone, contacts, or location permission in the current Android configuration. Microphone recording is blocked.',
      'The current Android app does not include an advertising SDK and does not read the advertising ID in Hidden Tunes source.',
      'Hidden Tunes does not currently collect payment card numbers, Google Play Billing purchases, or cryptocurrency / Hidden Coins through the Android app.',
      'We do not sell personal information.',
    ],
  },
  {
    id: 'local',
    title: 'Local device storage',
    paragraphs: [
      'Favorites, playlists, downloads, playback position, search caches, mature-content preferences, and similar library data are stored on the device.',
      'Signing out does not automatically erase on-device library data. Uninstalling the app or clearing the app’s storage removes local Hidden Tunes data on that device.',
    ],
  },
  {
    id: 'playback',
    title: 'Playback, catalog, and activity data',
    paragraphs: [
      'Search, browse, and play requests are sent to Hidden Tunes catalog services so the app can show music, radio, podcasts, audiobooks, TV, and related catalogs.',
      'Those requests include the identifiers or search terms needed to return results and start playback. Third-party stream hosts receive the playback request for the item you play.',
    ],
  },
  {
    id: 'processors',
    title: 'Processors and providers',
    paragraphs: [
      'Supabase: account authentication, session handling, and optional Cross Play progress / device registration.',
      'Hidden Tunes API hosts: api.hiddentunes.com and admin.hiddentunes.com for catalog, radio, podcasts, audiobooks, artist profiles, follow, and related features.',
      'Hostinger: the public website at hiddentunes.com and catalog API proxy routes used by the website.',
      'Cloudflare: some media files are stored on Cloudflare R2 and fetched over HTTPS when you play or view them.',
      'Expo: the app may check for JavaScript updates through Expo’s update service.',
      'Content sources used when you search or play them: Audius, Internet Archive, Jamendo (if configured), and YouTube (via an in-app WebView for YouTube-sourced video).',
      'Google Play provides Android distribution and related store services.',
      'Each provider processes data under its own terms when you use that provider’s service.',
    ],
  },
  {
    id: 'sharing',
    title: 'How we share information',
    paragraphs: [
      'We share account credentials and identifiers with Supabase to operate sign-in.',
      'We share follow and catalog requests with Hidden Tunes API hosts to operate those features.',
      'We share search/playback requests with the content provider of the item you requested.',
      'We share information if required by law or to protect Hidden Tunes, our users, or the public against abuse.',
      'We do not sell personal information and we do not share it with third parties for their independent advertising.',
    ],
  },
  {
    id: 'security',
    title: 'Security',
    paragraphs: [
      'Authentication, catalog, and website traffic use HTTPS.',
      'Access to account features uses the signed-in session. You should keep your email account secure because it can reset the Hidden Tunes password or receive a magic link.',
      'No method of transmission or storage is completely secure. This policy does not promise that information can never be accessed without authorization.',
    ],
  },
  {
    id: 'retention',
    title: 'Retention',
    paragraphs: [
      'Device data remains until you delete it, clear app storage, or uninstall Hidden Tunes.',
      'Search-result caches on the device are short-lived.',
      'Account data, follow data, and Cross Play records we control are kept while the account remains open and the feature is used.',
      'Server access logs on Hostinger or API hosts may exist as part of ordinary hosting. This policy does not invent a specific log-retention period.',
    ],
  },
  {
    id: 'deletion',
    title: 'Account and data deletion',
    paragraphs: [
      'You can sign out in the app. You can remove local favorites, playlists, and downloads. Uninstalling removes local app storage on that device.',
      'To request deletion of your Hidden Tunes account and the server-side account data we control (authentication data, follow records, and Cross Play progress associated with that account), email support [at] hiddentunes.com from the same email address used on the account. Tell us that you want the account deleted. The visible form avoids automated email obfuscation on the public website; it is the Hidden Tunes support mailbox.',
      'We will verify the request and delete account data we control. Data held only on your devices is removed by uninstalling or clearing storage. Third-party providers keep information according to their own policies.',
      'The current Android app does not include an automated in-app account-delete button. Email is the deletion request path.',
    ],
  },
  {
    id: 'children',
    title: 'Children’s privacy',
    paragraphs: [
      'Hidden Tunes is a general-audience entertainment product. It is not directed at children and it is not intended for children to create accounts.',
      'The catalogs can include mature or adult-oriented audio and video. Do not use Hidden Tunes to collect information from children.',
      'If you believe a child has provided personal information, contact support [at] hiddentunes.com so we can review and delete it.',
    ],
  },
  {
    id: 'international',
    title: 'International processing',
    paragraphs: [
      'Hidden Tunes and its processors may handle information in more than one country, including infrastructure operated by Supabase, Hostinger, Cloudflare, Expo, and content providers.',
      'If you use Hidden Tunes from outside the country where a processor is located, your information is processed in those locations as needed to provide the service.',
    ],
  },
  {
    id: 'changes',
    title: 'Changes',
    paragraphs: [
      'We may update this policy when the product or our processors change. The effective date above will change when we publish a revision at https://hiddentunes.com/privacy.',
    ],
  },
  {
    id: 'contact',
    title: 'Contact',
    paragraphs: [
      'Privacy contact: support [at] hiddentunes.com. You can also use https://hiddentunes.com/contact.',
      'Canonical policy URL: https://hiddentunes.com/privacy',
      'Android package: com.hiddentunes.app',
    ],
  },
]

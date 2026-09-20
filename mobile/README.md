# Kin Mobile App

The mobile companion for the Kin family memory system. This Expo/React Native app provides two modes:

- **Family Mode**: Relatives contribute photos, stories, and answer Weaver questions
- **Companion Mode**: The wearer taps "Who is this?" to get memory cues through audio

The app replicates the web app's design and flows for iPhone demo use.

## Features

### Family Mode (Memories)
- "Sharing as" chips to contribute as a relative
- Photo upload (library or camera) with simulated face labeling and consent
- Voice memory recording with listen-back preview before saving
- Memory grid with photos, transcripts, filters, and delete for your own
- Weaver "Question for you" cards with recorded answers

### Companion Mode (Recognize)
- Camera intro with permission request
- Single-action "Who is this?" button over a live camera view
- On-device face check on the captured frame (expo-face-detector)
- Cue card overlay + spoken cue (backend audio when configured, native TTS otherwise)
- Quiet "No familiar face this time" response when no face is in frame
- Long-press the button in fixture mode to preview the quiet response
- Resets to idle and silences audio when the app backgrounds

### Accessibility
- Screen reader support
- Text scaling for readability
- Large touch targets (44pt minimum)
- VoiceOver/TalkBack compatibility
- High contrast mode support
- Reduce motion support

## Project Structure

```
mobile/
├── app/                          # Expo Router screens
│   ├── _layout.tsx              # Root layout with navigation
│   ├── index.tsx                # Landing screen (mode selection)
│   ├── family.tsx               # Family mode main screen
│   └── companion.tsx            # Companion mode screen
├── src/
│   ├── adapters/                # Native device adapters
│   │   ├── camera.ts           # Camera and face detection
│   │   └── audio.ts            # Audio recording and playback
│   ├── api/
│   │   └── client.ts           # Backend API client
│   ├── components/
│   │   ├── ui.tsx             # Button, Sheet, Segmented, Notice, Pill, Avatar
│   │   ├── Brand.tsx          # Kin wordmark (react-native-svg)
│   │   ├── AppShell.tsx       # Header + floating bottom tab nav
│   │   ├── MemoryCard.tsx     # Memory card (photo/story/answer)
│   │   ├── PhotoUploader.tsx  # Photo pick, face label, consent
│   │   ├── Recorder.tsx       # Voice recording with preview
│   │   └── WeaverInbox.tsx    # Question prompt cards + answer sheet
│   ├── fixtures/
│   │   └── data.ts            # Fixture data for development
│   ├── types.ts                # TypeScript type definitions
│   └── utils/
│       ├── errorHandling.ts    # Error handling utilities
│       └── accessibility.ts    # Accessibility utilities
├── assets/                     # Images and icons
├── .env.example               # Environment variables template
├── app.json                   # Expo configuration
├── package.json               # Dependencies
├── tsconfig.json              # TypeScript configuration
└── metro.config.js            # Metro bundler configuration
```

## Setup

### Prerequisites
- Node.js 18+ 
- Expo CLI
- Physical iOS or Android device (or simulator/emulator)
- Expo Go app installed on device

### Installation

1. Navigate to the mobile directory:
```bash
cd mobile
```

2. Install dependencies:
```bash
npm install --legacy-peer-deps
```

(`npm ci` can fail on an optional `react-dom` peer in the lockfile; `--legacy-peer-deps` resolves it.)

3. Configure environment variables:
```bash
cp .env.example .env
```

Edit `.env` and set your backend API URL:
```
EXPO_PUBLIC_API_URL=https://your-backend-url.com
```

For local development with ngrok:
```
EXPO_PUBLIC_API_URL=https://your-ngrok-url.ngrok-free.app
```

### Running the App

Start the development server:
```bash
npm start
```

Then:
- Press `i` to open on iOS simulator
- Press `a` to open on Android emulator
- Scan the QR code with Expo Go on a physical device

### Building for Production

For iOS:
```bash
eas build --platform ios
```

For Android:
```bash
eas build --platform android
```

## Configuration

### Permissions

The app requires the following permissions (configured in `app.json`):

- **Camera**: For capturing photos and identifying faces
- **Microphone**: For recording stories and answers
- **Photo Library**: For selecting photos to upload

### Backend Integration

The app communicates with the Next.js backend through the API client (`src/api/client.ts`). The client:

- Uses HTTPS for all requests
- Stores session tokens securely using Expo Secure Store
- Handles file uploads with FormData
- Implements error handling and retry logic

### Fixture Data

When `EXPO_PUBLIC_API_URL` is unset (or still the placeholder), the app runs in
fixture mode using `src/fixtures/data.ts` — the same seeded demo family as the
web app. Photos and voice recordings added in fixture mode persist in-app and
play back locally.

In fixture Companion mode, `expo-face-detector` checks the captured frame for a
face: face present → a rotating grounded cue is spoken; no face → the quiet
response. If the detector module isn't bundled in the runtime (e.g. some Expo
Go builds), taps fall back to speaking a cue, and a long-press on "Who is
this?" previews the quiet response.

With `EXPO_PUBLIC_API_URL` set, Companion posts the snapshot to the real
`/api/recall` pipeline and honors the backend's speak/silent decision.

## Development

### Adding New Screens

1. Create a new file in `app/` (e.g., `app/settings.tsx`)
2. The file is automatically routed based on its name
3. Update `app/_layout.tsx` if needed for navigation

### Adding New Components

1. Create component files in `src/components/`
2. Follow the existing structure and naming conventions
3. Include proper accessibility attributes
4. Use the accessible utilities from `src/utils/accessibility.ts`

### API Integration

1. Add API methods to `src/api/client.ts`
2. Define request/response types in `src/types.ts`
3. Implement proper error handling
4. Add loading states and error UI

### Testing

Use the device test checklist (`DEVICE_TEST_CHECKLIST.md`) to verify functionality on physical devices.

## Accessibility Guidelines

### Touch Targets
- Minimum 44pt (iOS) / 48dp (Android)
- Use `ensureTouchTargetSize()` utility
- Test with finger, not just stylus

### Text Scaling
- Use `useScaledFontSize()` for dynamic text
- Set `allowFontScaling={true}` on Text components
- Test with largest font size setting

### Screen Reader
- All interactive elements need `accessibilityLabel`
- Add `accessibilityHint` for non-obvious actions
- Set correct `accessibilityRole`
- Use `accessibilityState` for dynamic states

### Visual Design
- WCAG AA color contrast (4.5:1 for text)
- Don't rely on color alone for meaning
- Support high contrast mode
- Respect reduce motion preference

## Error Handling

The app uses a comprehensive error handling system (`src/utils/errorHandling.ts`):

- Custom error types with user-friendly messages
- Permission error handling
- Network error handling with retry
- File validation and size limits
- Graceful degradation for failures

## Background Handling

The app properly handles background/foreground transitions:

- Recording stops when app backgrounds
- Audio playback pauses/resumes appropriately
- Camera cleanup on screen unmount
- State preservation where appropriate
- Clean reset when returning from background

## Troubleshooting

### Camera Not Working
- Check camera permissions in device settings
- Ensure camera permission is requested in app.json
- Test on physical device (simulator camera limitations)

### Audio Recording Issues
- Verify microphone permissions
- Check audio session configuration
- Test with different audio devices
- Ensure proper cleanup of audio resources

### Network Errors
- Verify backend URL is correct
- Check network connectivity
- Ensure HTTPS is configured
- Test with different network conditions

### Build Failures
- Clear Expo cache: `expo start -c`
- Reinstall dependencies: `rm -rf node_modules && npm install`
- Check Expo SDK version compatibility
- Review native module compatibility

## Security Notes

- No API keys or secrets in the app code
- Session tokens stored securely with Expo Secure Store
- HTTPS required for all API communication
- File uploads validated on backend
- Camera/microphone permissions properly declared

## Performance Optimization

- Lazy loading of screens with Expo Router
- Image optimization and caching
- Audio file cleanup
- Memory leak prevention
- Efficient re-renders with proper React patterns

## Future Enhancements

- Server-side face matching via `/api/recall` for fixture mode too
- Object recognition for memories
- Offline mode support
- Push notifications for Weaver questions
- Advanced accessibility features
- Additional language support

## License

This mobile app is part of the Kin project. See the main project LICENSE for details.

## Support

For issues or questions:
1. Check the device test checklist
2. Review error logs in Expo dev tools
3. Consult the main project documentation
4. Contact the development team

# Kin Mobile Device Test Checklist

This checklist is for verifying the core functionality of the Kin mobile app on a physical device. Tests should be performed on both iOS and Android devices if possible.

## Prerequisites

- [ ] Physical device (iOS or Android) connected and ready
- [ ] Expo Go app installed on the device
- [ ] Backend API URL configured in `.env` file
- [ ] Camera and microphone permissions granted
- [ ] Network connection available

## Family Mode Tests

### Relative Selection
- [ ] App launches successfully on device
- [ ] Landing screen shows both Family and Companion mode options
- [ ] Tapping "Family" navigates to relative picker
- [ ] Relative picker displays available family members
- [ ] Selecting a relative navigates to the main Family screen
- [ ] Selected relative's name and relationship are displayed
- [ ] "Not [Name]?" button returns to relative picker
- [ ] Screen reader announces relative names and relationships correctly

### Photo Upload
- [ ] "Add a photo" section is visible
- [ ] Tapping photo picker opens device photo library
- [ ] Photo library permission is requested if not granted
- [ ] Selected photo preview displays correctly
- [ ] "Select existing person" and "Add new person" options work
- [ ] Existing person list displays correctly
- [ ] Selecting a person highlights the selection
- [ ] Adding new person shows name and relationship fields
- [ ] Consent checkbox is accessible and functional
- [ ] Upload button is disabled until all required fields are filled
- [ ] Upload process shows loading state
- [ ] Success message appears after upload
- [ ] Uploaded photo appears in "My memories" list
- [ ] Error handling works for permission denial
- [ ] Error handling works for network failures

### Story Recording
- [ ] "Record a story" section is visible
- [ ] Microphone permission is requested if not granted
- [ ] "Record Story" button starts recording
- [ ] Recording indicator shows during recording
- [ ] Recording timer displays elapsed time
- [ ] "Stop Recording" button stops recording
- [ ] "Cancel" button cancels recording without saving
- [ ] Processing state shows after stopping
- [ ] Success message appears after processing
- [ ] Recorded story appears in "My memories" list
- [ ] Error handling works for microphone permission denial
- [ ] Error handling works for recording failures
- [ ] Error handling works for interrupted recordings

### Memory List
- [ ] "My memories" section displays user's memories
- [ ] Memory kind (PHOTO/STORY) is displayed
- [ ] Memory date is displayed
- [ ] Memory summary is displayed
- [ ] Story transcripts are displayed for story memories
- [ ] Empty state shows when no memories exist
- [ ] List is scrollable if many memories exist

### Weaver Questions
- [ ] "Questions from Kin" section appears when questions exist
- [ ] Question count is displayed correctly
- [ ] Tapping a question opens question detail view
- [ ] Question text is displayed clearly
- [ ] Related memories/evidence is shown
- [ ] "Record Answer" button starts recording
- [ ] Answer recording works like story recording
- [ ] Success message appears after answer submission
- [ ] Answered question is removed from the list
- [ ] "Back to Questions" returns to question list
- [ ] Empty state shows when no questions exist

## Companion Mode Tests

### Camera Setup
- [ ] Tapping "Companion" navigates to companion screen
- [ ] Camera permission is requested if not granted
- [ ] Camera preview displays correctly
- [ ] Camera uses rear-facing camera by default
- [ ] Camera permission error shows helpful message
- [ ] "Grant Permission" button works when permission denied
- [ ] "Back" button returns to landing screen

### Main Interaction
- [ ] "Who is this?" button is large and accessible
- [ ] Tapping button captures camera frame
- [ ] "Thinking…" state appears during processing
- [ ] Camera remains active during processing
- [ ] Button is disabled during processing
- [ ] Network errors are handled gracefully
- [ ] Camera errors are handled gracefully

### Successful Recognition (SPEAK)
- [ ] When recognition succeeds, cue text appears
- [ ] Cue display is positioned at bottom of screen
- [ ] Cue text is large and readable
- [ ] Audio playback begins if available
- [ ] TTS fallback works if audio fails
- [ ] Button shows "Listening…" during audio playback
- [ ] Cue auto-dismisses after 8 seconds
- [ ] Audio stops when cue dismisses
- [ ] Screen reader announces cue text
- [ ] Return to idle state after cue dismisses

### Silent Response (SILENT)
- [ ] When recognition fails, no cue appears
- [ ] No audio plays for silent response
- [ ] Button returns to "Who is this?" state
- [ ] Camera remains active for next attempt
- [ ] No error message shown for silent response
- [ ] Smooth transition back to idle state

### Background Handling
- [ ] App handles backgrounding during recording
- [ ] App handles backgrounding during processing
- [ ] App handles backgrounding during audio playback
- [ ] App resets to idle when returning from background
- [ ] Camera cleanup works when leaving screen
- [ ] Audio cleanup works when leaving screen

## Accessibility Tests

### Screen Reader
- [ ] All buttons have accessibility labels
- [ ] All interactive elements have accessibility hints
- [ ] Screen reader announces button states
- [ ] Screen reader announces recording state
- [ ] Screen reader announces cue text
- [ ] Screen reader announces error messages
- [ ] Focus order is logical
- [ ] Double-tap works on all interactive elements

### Visual Accessibility
- [ ] Text scales with device font size settings
- [ ] Touch targets meet minimum size requirements (44pt/48dp)
- [ ] Color contrast meets WCAG AA standards
- [ ] High contrast mode is respected
- [ ] Reduce motion preference is respected
- [ ] Bold text preference is respected

### Motor Accessibility
- [ ] All interactive elements are reachable without precise tapping
- [ ] Large buttons (44pt minimum) are used throughout
- [ ] Sufficient spacing between interactive elements
- [ ] Swipe gestures work as expected
- [ ] No time-based interactions that require fast response

## Error Handling Tests

### Permission Errors
- [ ] Camera permission denial shows clear message
- [ ] Microphone permission denial shows clear message
- [ ] Photo library permission denial shows clear message
- [ ] Permission errors guide user to settings
- [ ] App remains functional after permission denial

### Network Errors
- [ ] Network failures show clear error messages
- [ ] App handles intermittent network issues
- [ ] Retry mechanism works for failed requests
- [ ] App doesn't crash on network errors
- [ ] Offline state is handled gracefully

### File Errors
- [ ] File too large error is handled
- [ ] Invalid file format error is handled
- [ ] Corrupted file error is handled
- [ ] File upload failures show clear messages

### System Errors
- [ ] Low memory situation is handled
- [ ] Storage full error is handled
- [ ] App crashes are recoverable
- [ ] Error messages are user-friendly

## Performance Tests

### Startup Performance
- [ ] App launches within 3 seconds
- [ ] First screen renders smoothly
- [ ] No noticeable lag on initial navigation

### Recording Performance
- [ ] Recording starts within 1 second
- [ ] Recording is smooth without stuttering
- [ ] Recording stops promptly
- [ ] Processing completes within reasonable time

### Camera Performance
- [ ] Camera preview is smooth (30fps minimum)
- [ ] Frame capture is instant
- [ ] No lag during recognition processing

### Memory Usage
- [ ] App doesn't leak memory over time
- [ ] Memory usage stays within reasonable limits
- [ ] Background memory usage is acceptable

## Cross-Platform Tests

### iOS Specific
- [ ] Works on iPhone
- [ ] Works on iPad (if supported)
- [ ] iOS permission dialogs work correctly
- [ ] iOS-specific gestures work
- [ ] iOS audio routing works correctly

### Android Specific
- [ ] Works on various Android versions
- [ ] Works on different screen sizes
- [ ] Android permission dialogs work correctly
- [ ] Android back button works correctly
- [ ] Android-specific gestures work

## Edge Cases

### Concurrent Operations
- [ ] Can't start new recording while one is in progress
- [ ] Can't navigate away during critical operations
- [ ] Can't tap button multiple times rapidly
- [ ] Handles rapid successive taps gracefully

### State Preservation
- [ ] State is preserved across configuration changes
- [ ] State is preserved when app is backgrounded
- [ ] State is preserved when device rotates (if supported)

### Data Integrity
- [ ] Duplicate submissions are prevented
- [ ] Invalid data is rejected gracefully
- [ ] Data validation works correctly
- [ ] Form state is reset after successful submission

## Success Criteria

A test is considered successful when:
- The feature works as designed
- Error cases are handled gracefully
- Accessibility requirements are met
- Performance is acceptable
- User experience is smooth and intuitive

## Notes

- Test environment: [Device model, OS version]
- Backend URL: [URL used during testing]
- Network conditions: [WiFi/Cellular/Offline]
- Testing date: [Date]
- Tester: [Name]

## Issues Found

Document any issues discovered during testing:

1. [Issue description]
2. [Issue description]
3. [Issue description]

## Sign-off

- [ ] All critical tests passed
- [ ] All accessibility tests passed
- [ ] All error handling tests passed
- [ ] App is ready for demo/release

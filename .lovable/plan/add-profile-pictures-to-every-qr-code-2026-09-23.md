# Add profile pictures to every QR code

## What will change
- Restore the uploaded LinkMe project as the working app.
- Extend the shared QR renderer to place the current profile picture at the QR’s top center, with half above and half overlapping the code.
- Add a contrasting circular border/background and reserve a small protected area so the QR remains scannable.
- Reuse the existing profile-picture URL and initials fallback; no new upload flow or profile settings will be added.
- Pass the existing avatar data through every real user QR location, including the customization preview, profile area, public popup, and downloaded PNG.
- Keep the existing popup and download interactions unchanged.

## Validation
- Check that the app compiles and each QR call site uses the shared behavior.
- Verify the customization preview and public QR popup visually at desktop and mobile sizes.
- Confirm the downloaded QR includes the same profile picture treatment.

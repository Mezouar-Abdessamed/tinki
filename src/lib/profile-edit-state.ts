export type ProfileEditValues = {
  username: string;
  displayName: string;
  bio: string;
  avatarPath: string | null;
  coverPath: string | null;
  coverX: number;
  coverY: number;
};

/** A single staged save keeps photos and profile details consistent. */
export function hasProfileEdits(saved: ProfileEditValues, draft: ProfileEditValues, avatarPicked: boolean, coverPicked: boolean) {
  return avatarPicked || coverPicked || (Object.keys(saved) as Array<keyof ProfileEditValues>).some((key) => saved[key] !== draft[key]);
}
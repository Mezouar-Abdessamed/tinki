import {
  AtSign,
  Facebook,
  Gamepad2,
  Ghost,
  Github,
  Instagram,
  Joystick,
  Linkedin,
  MessageCircle,
  Music2,
  Send,
  Twitch,
  Youtube,
} from "lucide-react";

import type { CSSProperties } from "react";

import type { SocialKey } from "@/lib/profile-validation";

type IconProps = { className?: string | undefined; style?: CSSProperties | undefined };

function XIcon({ className, style }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      fill="currentColor"
      className={className}
      style={style}
    >
      <path d="M18.901 1.153h3.68l-8.04 9.19L24 22.846h-7.406l-5.8-7.584-6.638 7.584H.474l8.6-9.83L0 1.154h7.594l5.243 6.932ZM17.61 20.644h2.039L6.486 3.24H4.298Z" />
    </svg>
  );
}

function DiscordIcon({ className, style }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      fill="currentColor"
      className={className}
      style={style}
    >
      <path d="M20.317 4.369A19.79 19.79 0 0 0 15.432 3c-.21.375-.456.88-.625 1.28a18.27 18.27 0 0 0-5.614 0A12.6 12.6 0 0 0 8.56 3a19.74 19.74 0 0 0-4.886 1.372C.556 9.035-.32 13.58.118 18.058A19.93 19.93 0 0 0 6.11 21c.482-.66.91-1.36 1.28-2.096-.702-.264-1.372-.59-2.004-.973.168-.123.333-.252.492-.384 3.873 1.79 8.07 1.79 11.897 0 .16.132.325.261.492.384-.633.384-1.304.71-2.006.974.37.735.797 1.436 1.28 2.095a19.9 19.9 0 0 0 5.993-2.942c.5-5.177-.838-9.68-3.217-13.69ZM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.42 0-1.333.955-2.42 2.157-2.42 1.21 0 2.176 1.096 2.157 2.42 0 1.335-.955 2.42-2.157 2.42Zm7.96 0c-1.183 0-2.157-1.085-2.157-2.42 0-1.333.955-2.42 2.157-2.42 1.21 0 2.176 1.096 2.157 2.42 0 1.335-.947 2.42-2.157 2.42Z" />
    </svg>
  );
}

function RedditIcon({ className, style }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      fill="currentColor"
      className={className}
      style={style}
    >
      <path d="M24 11.78a2.57 2.57 0 0 0-4.36-1.84 12.6 12.6 0 0 0-6.87-2.2l1.17-5.5 3.82.81a1.84 1.84 0 1 0 .2-1.2L13.6.95a.6.6 0 0 0-.71.46l-1.3 6.13a12.6 12.6 0 0 0-6.96 2.2 2.57 2.57 0 1 0-2.84 4.2 5.1 5.1 0 0 0-.06.8c0 4.06 4.73 7.36 10.56 7.36s10.56-3.3 10.56-7.36a5.1 5.1 0 0 0-.06-.8A2.57 2.57 0 0 0 24 11.78ZM6.3 13.6a1.84 1.84 0 1 1 3.68 0 1.84 1.84 0 0 1-3.68 0Zm10.3 4.86c-1.26 1.26-3.67 1.36-4.38 1.36-.7 0-3.11-.1-4.37-1.36a.48.48 0 0 1 .68-.68c.8.8 2.5 1.08 3.7 1.08 1.19 0 2.9-.28 3.7-1.08a.48.48 0 1 1 .67.68Zm-.29-3.02a1.84 1.84 0 1 1 0-3.68 1.84 1.84 0 0 1 0 3.68Z" />
    </svg>
  );
}

export function SocialIcon({
  platform,
  className,
  style,
}: {
  platform: SocialKey;
  className?: string | undefined;
  style?: CSSProperties | undefined;
}) {
  switch (platform) {
    case "instagram":
      return <Instagram className={className} style={style} aria-hidden="true" />;
    case "facebook":
      return <Facebook className={className} style={style} aria-hidden="true" />;
    case "tiktok":
      return <Music2 className={className} style={style} aria-hidden="true" />;
    case "snapchat":
      return <Ghost className={className} style={style} aria-hidden="true" />;
    case "linkedin":
      return <Linkedin className={className} style={style} aria-hidden="true" />;
    case "x":
      return <XIcon className={className} style={style} />;
    case "youtube":
      return <Youtube className={className} style={style} aria-hidden="true" />;
    case "whatsapp":
      return <MessageCircle className={className} style={style} aria-hidden="true" />;
    case "telegram":
      return <Send className={className} style={style} aria-hidden="true" />;
    case "discord":
      return <DiscordIcon className={className} style={style} />;
    case "github":
      return <Github className={className} style={style} aria-hidden="true" />;
    case "steam":
      return <Joystick className={className} style={style} aria-hidden="true" />;
    case "epicgames":
      return <Gamepad2 className={className} style={style} aria-hidden="true" />;
    case "threads":
      return <AtSign className={className} style={style} aria-hidden="true" />;
    case "reddit":
      return <RedditIcon className={className} style={style} />;
    case "twitch":
      return <Twitch className={className} style={style} aria-hidden="true" />;
  }
}

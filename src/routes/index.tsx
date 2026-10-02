import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  component: Index,
});

// Blank page — empty HTML document.
function Index() {
  return null;
}

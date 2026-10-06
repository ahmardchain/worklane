export function Avatar({
  name = "Loop",
  size = 36,
}: {
  name?: string;
  size?: number;
}) {
  const colors = ["#b7d8ff", "#d2bfff", "#ffccab", "#d8efa1", "#f4b9d0"];
  const color =
    colors[[...name].reduce((a, c) => a + c.charCodeAt(0), 0) % colors.length];
  return (
    <svg
      className="avatar"
      width={size}
      height={size}
      viewBox="0 0 48 48"
      aria-hidden="true"
    >
      <rect x="2" y="2" width="44" height="44" rx="15" fill={color} />
      <path d="M14 17h5v8h-5zm15 0h5v8h-5z" fill="#202421" />
      <path
        d="M18 32h12"
        stroke="#202421"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

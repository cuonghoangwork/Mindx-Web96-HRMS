/** Five-star rating with the numeric value beside it. */
export function StarRating({ rating, size = 13 }) {
  const full = Math.round(rating);
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: "2px" }}>
      {Array.from({ length: 5 }, (_, i) => (
        <svg key={i} width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
          <path
            d="M12 2l2.9 6.6 7.1.6-5.4 4.7 1.7 7-6.3-3.9-6.3 3.9 1.7-7L1.9 9.2l7.1-.6z"
            fill={i < full ? "var(--clr-warning-400)" : "var(--bdr-default)"}
          />
        </svg>
      ))}
      <span style={{ marginLeft: "4px", fontSize: "var(--fs-sm)", color: "var(--txt-secondary)" }}>
        {rating.toFixed(1)}
      </span>
    </span>
  );
}

export default StarRating;

export function GardenArt({ className = "" }: { className?: string }) {
  return (
    <svg
      className={`garden-art ${className}`}
      viewBox="0 0 600 220"
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M0 220V143C36 90 81 104 105 151C147 86 197 105 225 165C278 113 321 112 359 162C395 96 451 118 477 162C526 114 575 139 600 167V220Z"
        fill="#e8e8cf"
      />
      <g stroke="#a5b987" strokeWidth="3" strokeLinecap="round">
        <path d="M43 220Q48 140 25 92M93 220Q82 161 120 125M166 220Q167 168 150 134M473 220Q467 146 504 100M551 220Q532 168 563 136" />
      </g>
      <g fill="#b8c79d">
        <ellipse
          cx="27"
          cy="104"
          rx="9"
          ry="25"
          transform="rotate(-26 27 104)"
        />
        <ellipse
          cx="50"
          cy="149"
          rx="9"
          ry="24"
          transform="rotate(38 50 149)"
        />
        <ellipse
          cx="29"
          cy="167"
          rx="10"
          ry="25"
          transform="rotate(-42 29 167)"
        />
        <ellipse
          cx="113"
          cy="139"
          rx="10"
          ry="25"
          transform="rotate(36 113 139)"
        />
        <ellipse
          cx="86"
          cy="174"
          rx="9"
          ry="24"
          transform="rotate(-35 86 174)"
        />
        <ellipse
          cx="150"
          cy="149"
          rx="9"
          ry="22"
          transform="rotate(-22 150 149)"
        />
        <ellipse
          cx="177"
          cy="183"
          rx="9"
          ry="22"
          transform="rotate(45 177 183)"
        />
        <ellipse
          cx="498"
          cy="121"
          rx="10"
          ry="27"
          transform="rotate(26 498 121)"
        />
        <ellipse
          cx="466"
          cy="155"
          rx="9"
          ry="24"
          transform="rotate(-33 466 155)"
        />
        <ellipse
          cx="487"
          cy="184"
          rx="9"
          ry="24"
          transform="rotate(50 487 184)"
        />
        <ellipse
          cx="558"
          cy="150"
          rx="9"
          ry="23"
          transform="rotate(25 558 150)"
        />
        <ellipse
          cx="532"
          cy="180"
          rx="9"
          ry="23"
          transform="rotate(-37 532 180)"
        />
      </g>
      <g stroke="#bdc99c" strokeWidth="3">
        <path d="M212 220V180M417 220V162" />
      </g>
      <g fill="#ead59a">
        <ellipse
          cx="207"
          cy="175"
          rx="5"
          ry="12"
          transform="rotate(-25 207 175)"
        />
        <ellipse
          cx="217"
          cy="175"
          rx="5"
          ry="12"
          transform="rotate(25 217 175)"
        />
        <ellipse
          cx="412"
          cy="157"
          rx="5"
          ry="12"
          transform="rotate(-25 412 157)"
        />
        <ellipse
          cx="422"
          cy="157"
          rx="5"
          ry="12"
          transform="rotate(25 422 157)"
        />
      </g>
    </svg>
  );
}

const URL_PATTERN = /(https?:\/\/[^\s]+)/g;

export default function LinkifyText({ text, className }: { text: string; className?: string }) {
  const parts = text.split(URL_PATTERN);

  return (
    <span className={className}>
      {parts.map((part, i) =>
        URL_PATTERN.test(part) ? (
          <a
            key={i}
            href={part}
            target="_blank"
            rel="noopener noreferrer"
            className="text-brand-teal underline underline-offset-2 hover:text-brand-teal/80 break-all"
          >
            {part}
          </a>
        ) : (
          part
        )
      )}
    </span>
  );
}

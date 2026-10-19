"use client";

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

const questions = [
  {
    question: "What is openBGremover?",
    answer:
      "Media tools for apps and agents, with a playground to work with your images and an API to connect your workflow.",
  },
  {
    question: "Can I try it without an account?",
    answer:
      "Yes. Upload an image in the playground to try background removal. The public demo is rate limited. Create an account to manage API keys and view your usage.",
  },
  {
    question: "Which files can I upload?",
    answer:
      "Background removal accepts PNG, JPEG, and WebP images up to 10 MB. Compress and Convert also accept AVIF, and Convert accepts HEIC photos from iPhones. The API also enforces a 25-megapixel input limit. Your original image is uploaded without browser downscaling.",
  },
  {
    question: "Does the result keep transparency?",
    answer:
      "The playground downloads a transparent PNG. Through the API, PNG and WebP preserve soft alpha. JPEG output uses a white background.",
  },
  {
    question: "Can my agent use the API?",
    answer:
      "Yes. Your app or agent can send an image to the HTTP API with an API key. Use the Node.js or Python client, or connect your agent using the setup instructions.",
  },
  {
    question: "Why can the first image take longer?",
    answer:
      "The processing service scales down when idle. The first request after a pause can include startup time. Your image is sent once, without automatic processing retries.",
  },
];

export function Faq() {
  return (
    <Accordion type="single" collapsible className="w-full">
      {questions.map((item) => (
        <AccordionItem
          key={item.question}
          value={item.question}
          className="border-border px-6 sm:px-10"
        >
          <AccordionTrigger className="py-7 text-base font-medium">
            {item.question}
          </AccordionTrigger>
          <AccordionContent className="max-w-xl pb-7 text-base leading-relaxed text-muted-foreground">
            {item.answer}
          </AccordionContent>
        </AccordionItem>
      ))}
    </Accordion>
  );
}

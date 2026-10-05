/**
 * The component kit (item 32). Import from `@/components/ui`.
 *
 * DESIGN.md §3 is the rule that shapes these: **colour never carries meaning
 * alone.** Red and green are the Union's identity and also the worst possible
 * pair for red-green colour vision deficiency, so every state is carried by a
 * word and a shape as well as a tone, and each remains legible in greyscale and
 * in both themes.
 */
export { Button, buttonVariants, type ButtonProps } from "./button";
export { Card, Section } from "./card";
export { Field, Select, TextArea, TextInput, controlClass } from "./field";
export { EmptyState, Kbd, PageHeader, Skeleton } from "./layout";
export { ErrorNotice, Notice } from "./notice";
export { StatusChip } from "./status-chip";
export {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "./table";
export { TabLinks, Tabs, TabsContent, TabsList, TabsTrigger } from "./tabs";

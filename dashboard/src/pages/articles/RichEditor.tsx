import React from "react";
import { EditorContent, useEditor, useEditorState, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Image from "@tiptap/extension-image";
import { CharacterCount, Placeholder } from "@tiptap/extensions";
import {
  Bold,
  Heading2,
  Heading3,
  Heading4,
  ImagePlus,
  Italic,
  Link2,
  List,
  ListOrdered,
  Minus,
  Pilcrow,
  Quote,
  Redo2,
  Strikethrough,
  Underline,
  Undo2,
  Unlink,
} from "lucide-react";
import { toast } from "sonner";
import { errorMessage } from "@/lib/api";
import { Button } from "@/ui/button";
import { Checkbox, Field, Input } from "@/ui/form";
import { Dialog } from "@/ui/layout";
import { cn } from "@/ui/cn";
import { uploadArticleImage } from "./images";

type Props = {
  articleId: string;
  value: string;
  onChange: (html: string) => void;
  /** The loaded body as the editor writes it, which can differ in form (not content) from what was stored. */
  onReady?: (html: string) => void;
  disabled?: boolean;
};

/** The article body editor. It writes HTML; the Worker sanitises it to the same tags on save. */
export function RichEditor({ articleId, value, onChange, onReady, disabled }: Props) {
  const [uploading, setUploading] = React.useState(0);
  const editorRef = React.useRef<Editor | null>(null);

  const insertImages = React.useCallback(
    async (files: File[], at?: number) => {
      const images = files.filter((f) => f.type.startsWith("image/"));
      for (const file of images) {
        setUploading((n) => n + 1);
        try {
          const image = await uploadArticleImage(articleId, file);
          const editor = editorRef.current;
          if (!editor) return;
          const chain = editor.chain().focus();
          (at != null ? chain.setTextSelection(at) : chain).setImage({ src: image.full, alt: file.name.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " "), width: image.width, height: image.height }).run();
        } catch (error) {
          toast.error(errorMessage(error));
        } finally {
          setUploading((n) => n - 1);
        }
      }
    },
    [articleId],
  );

  const editor = useEditor({
    editable: !disabled,
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3, 4] },
        code: false,
        codeBlock: false,
        link: { openOnClick: false, autolink: true, defaultProtocol: "https", HTMLAttributes: { rel: null, target: null } },
      }),
      Image,
      Placeholder.configure({ placeholder: "Start writing. Use the toolbar for headings, lists, links and images…" }),
      CharacterCount,
    ],
    content: value,
    editorProps: {
      attributes: { class: "article-prose min-h-[420px] px-5 py-4 focus:outline-none", "aria-label": "Article body" },
      handlePaste: (_view, event) => {
        const files = [...(event.clipboardData?.files ?? [])];
        if (!files.some((f) => f.type.startsWith("image/"))) return false;
        void insertImages(files);
        return true;
      },
      handleDrop: (view, event) => {
        const files = [...(event.dataTransfer?.files ?? [])];
        if (!files.some((f) => f.type.startsWith("image/"))) return false;
        event.preventDefault();
        const pos = view.posAtCoords({ left: event.clientX, top: event.clientY })?.pos;
        void insertImages(files, pos);
        return true;
      },
    },
    onCreate: ({ editor }) => onReady?.(editor.isEmpty ? "" : editor.getHTML()),
    onUpdate: ({ editor }) => onChange(editor.isEmpty ? "" : editor.getHTML()),
  });
  editorRef.current = editor;

  React.useEffect(() => {
    editor?.setEditable(!disabled);
  }, [editor, disabled]);

  const words = useEditorState({ editor, selector: ({ editor }) => editor?.storage.characterCount.words() ?? 0 });

  return (
    <div className="overflow-hidden rounded-lg border border-border bg-card focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/30">
      {editor && <Toolbar editor={editor} disabled={disabled} onImages={(files) => void insertImages(files)} />}
      <EditorContent editor={editor} />
      <div className="flex items-center justify-between border-t border-border px-4 py-2 text-xs text-muted-foreground">
        <span>
          {words} word{words === 1 ? "" : "s"} · {Math.max(1, Math.round(words / 200))} min read
        </span>
        {uploading > 0 && <span className="text-foreground">Uploading {uploading} image{uploading === 1 ? "" : "s"}…</span>}
      </div>
    </div>
  );
}

function Toolbar({ editor, disabled, onImages }: { editor: Editor; disabled?: boolean; onImages: (files: File[]) => void }) {
  const fileRef = React.useRef<HTMLInputElement>(null);
  const [linking, setLinking] = React.useState(false);
  const state = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      paragraph: e.isActive("paragraph"),
      h2: e.isActive("heading", { level: 2 }),
      h3: e.isActive("heading", { level: 3 }),
      h4: e.isActive("heading", { level: 4 }),
      bold: e.isActive("bold"),
      italic: e.isActive("italic"),
      underline: e.isActive("underline"),
      strike: e.isActive("strike"),
      link: e.isActive("link"),
      bullet: e.isActive("bulletList"),
      ordered: e.isActive("orderedList"),
      quote: e.isActive("blockquote"),
      canUndo: e.can().undo(),
      canRedo: e.can().redo(),
    }),
  });
  const chain = () => editor.chain().focus();

  return (
    <div className="sticky top-0 z-10 flex flex-wrap items-center gap-0.5 border-b border-border bg-card/95 px-2 py-1.5 backdrop-blur" role="toolbar" aria-label="Formatting">
      <Tool label="Paragraph" active={state.paragraph} disabled={disabled} onClick={() => chain().setParagraph().run()} icon={Pilcrow} />
      <Tool label="Heading" active={state.h2} disabled={disabled} onClick={() => chain().toggleHeading({ level: 2 }).run()} icon={Heading2} />
      <Tool label="Subheading" active={state.h3} disabled={disabled} onClick={() => chain().toggleHeading({ level: 3 }).run()} icon={Heading3} />
      <Tool label="Small heading" active={state.h4} disabled={disabled} onClick={() => chain().toggleHeading({ level: 4 }).run()} icon={Heading4} />
      <Divider />
      <Tool label="Bold (Ctrl+B)" active={state.bold} disabled={disabled} onClick={() => chain().toggleBold().run()} icon={Bold} />
      <Tool label="Italic (Ctrl+I)" active={state.italic} disabled={disabled} onClick={() => chain().toggleItalic().run()} icon={Italic} />
      <Tool label="Underline (Ctrl+U)" active={state.underline} disabled={disabled} onClick={() => chain().toggleUnderline().run()} icon={Underline} />
      <Tool label="Strikethrough" active={state.strike} disabled={disabled} onClick={() => chain().toggleStrike().run()} icon={Strikethrough} />
      <Divider />
      <Tool label="Bulleted list" active={state.bullet} disabled={disabled} onClick={() => chain().toggleBulletList().run()} icon={List} />
      <Tool label="Numbered list" active={state.ordered} disabled={disabled} onClick={() => chain().toggleOrderedList().run()} icon={ListOrdered} />
      <Tool label="Quote" active={state.quote} disabled={disabled} onClick={() => chain().toggleBlockquote().run()} icon={Quote} />
      <Tool label="Divider line" disabled={disabled} onClick={() => chain().setHorizontalRule().run()} icon={Minus} />
      <Divider />
      <Tool label="Link (Ctrl+K)" active={state.link} disabled={disabled} onClick={() => setLinking(true)} icon={Link2} />
      {state.link && <Tool label="Remove link" disabled={disabled} onClick={() => chain().extendMarkRange("link").unsetLink().run()} icon={Unlink} />}
      <Tool label="Insert image" disabled={disabled} onClick={() => fileRef.current?.click()} icon={ImagePlus} />
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={(e) => {
          onImages([...(e.target.files ?? [])]);
          e.target.value = "";
        }}
      />
      <div className="ml-auto flex">
        <Tool label="Undo (Ctrl+Z)" disabled={disabled || !state.canUndo} onClick={() => chain().undo().run()} icon={Undo2} />
        <Tool label="Redo (Ctrl+Shift+Z)" disabled={disabled || !state.canRedo} onClick={() => chain().redo().run()} icon={Redo2} />
      </div>
      <LinkDialog editor={editor} open={linking} onClose={() => setLinking(false)} />
      <KeyboardLink editor={editor} onOpen={() => setLinking(true)} />
    </div>
  );
}

function Tool({ label, icon: Icon, active, disabled, onClick }: { label: string; icon: React.ComponentType<{ className?: string }>; active?: boolean; disabled?: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active}
      disabled={disabled}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={cn(
        "flex h-9 w-9 items-center justify-center rounded-md text-foreground/80 transition-colors hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40",
        active && "bg-primary-muted text-foreground ring-1 ring-primary/40",
      )}
    >
      <Icon className="h-4 w-4" />
    </button>
  );
}

const Divider = () => <span className="mx-1 h-6 w-px bg-border" aria-hidden />;

// Ctrl/Cmd+K opens the link dialog while the editor has focus.
function KeyboardLink({ editor, onOpen }: { editor: Editor; onOpen: () => void }) {
  React.useEffect(() => {
    const dom = editor.view.dom;
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        onOpen();
      }
    };
    dom.addEventListener("keydown", handler);
    return () => dom.removeEventListener("keydown", handler);
  }, [editor, onOpen]);
  return null;
}

function LinkDialog({ editor, open, onClose }: { editor: Editor; open: boolean; onClose: () => void }) {
  const [href, setHref] = React.useState("");
  const [newTab, setNewTab] = React.useState(false);
  React.useEffect(() => {
    if (!open) return;
    const attrs = editor.getAttributes("link") as { href?: string; target?: string };
    setHref(attrs.href ?? "");
    setNewTab(attrs.target === "_blank");
  }, [open, editor]);

  function apply(event: React.FormEvent) {
    event.preventDefault();
    const url = href.trim();
    const chain = editor.chain().focus().extendMarkRange("link");
    if (!url) chain.unsetLink().run();
    else {
      const full = /^(https?:\/\/|mailto:|tel:|\/|#)/i.test(url) ? url : `https://${url}`;
      if (editor.state.selection.empty && !editor.isActive("link")) chain.insertContent({ type: "text", text: url, marks: [{ type: "link", attrs: { href: full, target: newTab ? "_blank" : null } }] }).run();
      else chain.setLink({ href: full, target: newTab ? "_blank" : null }).run();
    }
    onClose();
  }

  return (
    <Dialog open={open} onClose={onClose} title="Link" width="max-w-md">
      <form onSubmit={apply} className="flex flex-col gap-4">
        <Field label="Web address" hint="A full address, or a page on the site like /sitara-villas/">
          <Input autoFocus value={href} placeholder="https://" onChange={(e) => setHref(e.target.value)} />
        </Field>
        <Checkbox label="Open in a new tab" checked={newTab} onChange={setNewTab} />
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit">{href.trim() ? "Apply link" : "Remove link"}</Button>
        </div>
      </form>
    </Dialog>
  );
}

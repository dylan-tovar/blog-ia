# blog-ia

Plataforma de publicación tipo Substack asistida por IA. Monolito Next.js 16 (App Router, React 19) con Supabase (PostgreSQL, Auth, RLS), shadcn/ui y Gemini. Los usuarios leen, siguen y publican artículos y notas; un chat de IA dentro del editor propone cambios que el autor decide aplicar, la IA modera al publicar y resume artículos para los lectores.

## Empezar

```bash
pnpm install
# crear .env.local con las variables de docs/guides/getting-started.md
# aplicar supabase/migrations/0001 a 0007 en el SQL Editor de Supabase
pnpm seed:dev   # opcional: datos de prueba
pnpm dev        # http://localhost:3000
```

Requiere Node 20.9 o superior y pnpm. El detalle (variables de entorno, migraciones, scripts) está en [`docs/guides/getting-started.md`](docs/guides/getting-started.md).

## Documentación

Todo está en [`docs/`](docs/README.md): qué se construyó, cómo funciona y por qué se decidió así.

| Para... | Leer |
| :--- | :--- |
| Entender el proyecto en 10 minutos | [`docs/README.md`](docs/README.md) |
| Ver la arquitectura y los flujos | [`docs/architecture/overview.md`](docs/architecture/overview.md) |
| Saber por qué se hizo así | [`docs/adr/`](docs/adr/README.md) |
| Entender la IA | [`docs/ai/overview.md`](docs/ai/overview.md) |
| Agregar una feature | [`docs/guides/contributing.md`](docs/guides/contributing.md) |

> Esta versión de Next.js tiene cambios respecto a lo habitual (`proxy.ts` en lugar de `middleware`, tipos `PageProps`). Antes de escribir código, ver [`AGENTS.md`](AGENTS.md).

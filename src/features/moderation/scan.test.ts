import { describe, expect, it } from "vitest";
import { normalize, scan, scanArticle, scanText } from "./scan";

const terms = (text: string) => scanText(text).map((match) => match.term);

describe("normalize", () => {
  it("quita acentos y pasa a minúsculas conservando la posición original", () => {
    const { text, map } = normalize("Canción");

    expect(text).toBe("cancion");
    // La "ó" ocupa una posición en el original y una en el normalizado.
    expect(map[text.indexOf("o")]).toBe("Canci".length);
  });

  it("trata la ñ como n, que es como están escritos los términos", () => {
    expect(normalize("coño").text).toBe("cono");
  });

  it("sustituye números por letras solo dentro de una palabra", () => {
    expect(normalize("p4sa").text).toBe("pasa");
    expect(normalize("son 40 casos").text).toBe("son 40 casos");
  });

  it("sustituye una corrida de números al inicio de la palabra, no solo al final", () => {
    // El "3" inicial no tiene una letra ya convertida a su izquierda: hay que mirar
    // la corrida completa ("35") y su vecino a la derecha ("t") para convertirla.
    expect(normalize("35tup1d0").text).toBe("estupido");
  });
});

describe("scanText", () => {
  it("no marca nada en un texto normal", () => {
    expect(
      terms("Este artículo explica por qué las políticas RLS son la defensa real de una app."),
    ).toEqual([]);
  });

  it("detecta un insulto con su categoría y su severidad", () => {
    const [match] = scanText("No seas idiota con los lectores.");

    expect(match.term).toBe("idiota");
    expect(match.category).toBe("insulto");
    expect(match.severity).toBe("leve");
  });

  it("devuelve la posición exacta del fragmento en el texto original", () => {
    const text = "Un párrafo y luego idiota al final.";
    const [match] = scanText(text);

    expect(text.slice(match.start, match.end)).toBe("idiota");
    expect(match.excerpt).toBe("idiota");
  });

  it("respeta los límites de palabra: no marca un término contenido en otra palabra", () => {
    // "putativo" y "computadora" contienen letras de términos del diccionario.
    expect(terms("El padre putativo usó una computadora.")).toEqual([]);
  });

  it("detecta aunque cambien mayúsculas, acentos y repeticiones", () => {
    expect(terms("IDIOTA")).toEqual(["idiota"]);
    expect(terms("imbécil")).toEqual(["imbecil"]);
    expect(terms("idiiiiota")).toEqual(["idiota"]);
  });

  it("detecta la evasión con separadores intercalados", () => {
    expect(terms("i-d-i-o-t-a")).toEqual(["idiota"]);
    expect(terms("i.d.i.o.t.a")).toEqual(["idiota"]);
  });

  it("detecta la evasión con números en lugar de letras", () => {
    expect(terms("1diota")).toEqual(["idiota"]);
    expect(terms("id10ta")).toEqual(["idiota"]);
  });

  it("detecta la evasión con números incluso al inicio de la palabra", () => {
    expect(terms("eres un 35tup1d0")).toEqual(["estupido"]);
  });

  it("detecta el plural", () => {
    expect(terms("son unos idiotas")).toEqual(["idiota"]);
  });

  it("detecta el plural en -es de un término terminado en consonante", () => {
    expect(terms("son unos imbeciles")).toEqual(["imbecil"]);
    expect(terms("son unos cabrones")).toEqual(["cabron"]);
  });

  it("prefiere la frase más larga sobre un término más corto que empieza igual", () => {
    expect(terms("eres un sudaca de mierda")).toEqual(["sudaca de mierda"]);
  });

  it("detecta el insulto misógino 'perra'", () => {
    const [match] = scanText("qué perra que sos");

    expect(match.term).toBe("perra");
    expect(match.category).toBe("insulto");
    expect(match.severity).toBe("leve");
  });

  it("detecta amenazas de doxxing y contra la familia", () => {
    expect(scanText("tengo tu direccion")[0].severity).toBe("grave");
    expect(scanText("le va a pasar algo a tu familia")[0].severity).toBe("grave");
  });

  it("detecta frases de varias palabras y tolera el espaciado", () => {
    expect(terms("te voy a matar")).toEqual(["te voy a matar"]);
    expect(terms("te  voy  a  matar")).toEqual(["te voy a matar"]);
  });

  it("informa una sola vez cuando una frase contiene otro término", () => {
    const found = scanText("sos un hijo de puta");

    expect(found).toHaveLength(1);
    expect(found[0].term).toBe("hijo de puta");
  });

  it("clasifica la amenaza y el odio como graves", () => {
    expect(scanText("ojalá te mueras")[0].severity).toBe("grave");
    expect(scanText("son una raza inferior")[0].severity).toBe("grave");
  });

  it("deja los coloquialismos venezolanos en leve, no en grave", () => {
    // "marico" es muletilla habitual en Venezuela: avisa, pero no debe bloquear.
    expect(scanText("marico, qué buena esa")[0].severity).toBe("leve");
  });

  it("no marca palabras de uso corriente que también aparecen en contextos ofensivos", () => {
    expect(terms("El gato negro cruzó la calle.")).toEqual([]);
    expect(terms("Coño, qué buena noticia.")).toEqual([]);
    expect(terms("Está arrecho el examen.")).toEqual([]);
    expect(terms("Sacá la basura, por favor.")).toEqual([]);
  });

  it("devuelve las coincidencias ordenadas por su posición", () => {
    const found = scanText("primero idiota y después te voy a matar");

    expect(found.map((match) => match.term)).toEqual(["idiota", "te voy a matar"]);
    expect(found[0].start).toBeLessThan(found[1].start);
  });
});

describe("scan", () => {
  it("resume un texto limpio sin bloquear", () => {
    expect(scan("Un artículo sobre bases de datos.")).toEqual({
      matches: [],
      grave: 0,
      leve: 0,
      blocked: false,
      categories: [],
    });
  });

  it("no bloquea cuando solo hay insultos", () => {
    const summary = scan("No seas idiota.");

    expect(summary).toMatchObject({ grave: 0, leve: 1, blocked: false, categories: ["insulto"] });
  });

  it("bloquea en cuanto aparece una coincidencia grave", () => {
    const summary = scan("No seas idiota, ojalá te mueras.");

    expect(summary.blocked).toBe(true);
    expect(summary.grave).toBe(1);
    expect(summary.leve).toBe(1);
    expect(summary.categories).toEqual(["amenaza", "insulto"]);
  });

  it("no se cuelga con un texto largo", () => {
    const largo = "Un párrafo normal sobre bases de datos. ".repeat(2_000);
    const startedAt = Date.now();

    expect(scan(largo).blocked).toBe(false);
    expect(Date.now() - startedAt).toBeLessThan(1_000);
  });
});

describe("scanArticle", () => {
  it("no arma una frase grave cruzando el límite entre título y contenido", () => {
    // "te voy a" (título) + "matar el tiempo..." (contenido) no debe leerse como
    // "te voy a matar": cada campo se escanea por separado, nunca unidos.
    const summary = scanArticle("Hoy te voy a", "matar el tiempo leyendo esto");

    expect(summary.blocked).toBe(false);
    expect(summary.matches).toEqual([]);
  });

  it("sigue detectando una frase grave completa dentro de un mismo campo", () => {
    expect(scanArticle("Un título cualquiera", "ojalá te mueras").blocked).toBe(true);
    expect(scanArticle("ojalá te mueras", "un contenido cualquiera").blocked).toBe(true);
  });
});

import { useId, useState } from 'react';
import './Quiz.css';

export interface QuizQuestion {
  pregunta: string;
  opciones: string[];
  /** Índice (desde 0) de la opción correcta. */
  correcta: number;
  /** Por qué es correcta y, si ayuda, por qué fallan las demás. */
  explicacion: string;
}

interface Props {
  titulo?: string;
  preguntas: QuizQuestion[];
}

/**
 * Carcasa del quiz (Fase 2): una pregunta por bloque, comprobación al pulsar y explicación.
 * La Fase 5 añadirá el progreso guardado y los resultados por módulo.
 */
export default function Quiz({ titulo = 'Comprueba lo aprendido', preguntas }: Props) {
  const baseId = useId();
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [checked, setChecked] = useState<Record<number, boolean>>({});

  const correctCount = preguntas.filter((q, i) => checked[i] && answers[i] === q.correcta).length;
  const checkedCount = preguntas.filter((_, i) => checked[i]).length;

  return (
    <section className="quiz" aria-label={titulo}>
      <p className="quiz-title">{titulo}</p>
      {preguntas.map((q, i) => {
        const name = `${baseId}-${i}`;
        const isChecked = checked[i] === true;
        const isRight = isChecked && answers[i] === q.correcta;
        return (
          <fieldset className="quiz-question" key={q.pregunta}>
            <legend>
              <span className="quiz-number">
                Pregunta {i + 1} de {preguntas.length}.
              </span>{' '}
              {q.pregunta}
            </legend>
            {q.opciones.map((option, j) => (
              <label className="quiz-option" key={option}>
                <input
                  type="radio"
                  name={name}
                  checked={answers[i] === j}
                  disabled={isChecked}
                  onChange={() => setAnswers((a) => ({ ...a, [i]: j }))}
                />
                <span>{option}</span>
              </label>
            ))}
            {!isChecked && (
              <button
                type="button"
                className="btn"
                disabled={answers[i] === undefined}
                onClick={() => setChecked((c) => ({ ...c, [i]: true }))}
              >
                Comprobar
              </button>
            )}
            <div role="status" aria-live="polite">
              {isChecked && (
                <p className={`quiz-feedback ${isRight ? 'is-right' : 'is-wrong'}`}>
                  <strong>
                    {isRight ? 'Correcto.' : `No es esa. La correcta es: ${q.opciones[q.correcta]}.`}
                  </strong>{' '}
                  {q.explicacion}
                </p>
              )}
            </div>
          </fieldset>
        );
      })}
      <p className="quiz-score">
        {checkedCount === 0
          ? 'Responde y pulsa «Comprobar» en cada pregunta.'
          : `${correctCount} aciertos de ${checkedCount} comprobadas.`}
      </p>
      <noscript>
        <p>Este cuestionario necesita JavaScript para comprobar las respuestas.</p>
      </noscript>
    </section>
  );
}

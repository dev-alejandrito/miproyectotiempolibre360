import { Link } from "@/lib/router";
import { PageHeader } from "../../components/ui";

const Q = [
  ["¿Qué es TIEMPO LIBRE 360?", "Es un banco de tiempo: una comunidad donde las personas intercambian conocimientos, habilidades y servicios. 1 minuto de servicio equivale a 1 crédito: una sesión de 30 minutos cuesta 30 créditos."],
  ["¿Se paga con dinero?", "Los intercambios normales son gratuitos y solo usan créditos de tiempo que ganas enseñando y usas aprendiendo. Las clases personalizadas son opcionales: tienen un precio en pesos mexicanos que fija el instructor y se pagan en línea de forma segura."],
  ["¿Necesito certificados para ofrecer una habilidad?", "Para aprender, no. Cualquier persona puede registrarse, aprender y participar. Para ofrecer una habilidad como instructor, debe presentar evidencias, como un certificado y un video demostrativo, que serán revisados por un administrador antes de poder enseñarla."],
  ["¿Cómo consigo mis primeros créditos?", "Al registrarte recibes créditos de bienvenida. Después los ganas enseñando y completando retos de la comunidad."],
  ["¿Cuándo se liberan los créditos?", "Los créditos se reservan al solicitar un intercambio y se transfieren cuando ambas personas confirman que la sesión se completó. No permitimos saldos negativos ni cobros duplicados. Si se rechaza o cancela, vuelven a tu saldo."],
  ["¿Qué pasa si la otra persona no aparece?", "Cualquiera de las partes puede abrir un conflicto una vez pasada la hora de la sesión. Moderación revisa y decide: devolver los créditos o liberarlos."],
  ["¿Cómo funcionan las recomendaciones?", "Comparamos lo que quieres aprender con lo que otras personas ofrecen, y tenemos en cuenta nivel, modalidad, intereses y horarios. Cada recomendación indica sus motivos."],
  ["¿Recibiré avisos?", "Sí: notificaciones dentro de la plataforma."],
  ["¿Cómo se moderan los contenidos?", "Puedes reportar a cualquier persona. El equipo de moderación revisa los reportes, puede ocultar contenido y suspender cuentas, y todas sus acciones quedan auditadas."],
];

export default function Faq() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-12">
      <PageHeader title="Preguntas frecuentes" subtitle="Lo esencial para empezar con confianza." />
      <div className="space-y-3">
        {Q.map(([q, a]) => (
          <details key={q} className="card group open:bg-white">
            <summary className="cursor-pointer list-none text-lg font-bold marker:hidden"><span className="mr-2 text-amber-deep group-open:hidden" aria-hidden="true">+</span><span className="mr-2 hidden text-amber-deep group-open:inline" aria-hidden="true">−</span>{q}</summary>
            <p className="mt-3 text-[#3c3829]">{a}</p>
          </details>
        ))}
      </div>
      <p className="mt-8 text-center">¿Sigues con dudas? <Link to="/contacto" className="font-bold underline">Escríbenos</Link>.</p>
    </div>
  );
}

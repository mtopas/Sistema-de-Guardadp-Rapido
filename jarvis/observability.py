import logging

logger = logging.getLogger(__name__)

_langfuse_ok = False
_otel_ok = False


def setup() -> None:
    global _langfuse_ok, _otel_ok
    _setup_langfuse()
    _setup_otel()


def _setup_langfuse() -> None:
    global _langfuse_ok
    from jarvis.config import LANGFUSE_HOST, LANGFUSE_PUBLIC_KEY, LANGFUSE_SECRET_KEY

    if not (LANGFUSE_HOST and LANGFUSE_PUBLIC_KEY and LANGFUSE_SECRET_KEY):
        logger.warning("[jarvis.obs] Langfuse no configurado (LANGFUSE_HOST/PUBLIC_KEY/SECRET_KEY). Trazas LLM desactivadas.")
        return

    try:
        from langfuse.callback import CallbackHandler as LangfuseCallback
        import litellm

        handler = LangfuseCallback(
            host=LANGFUSE_HOST,
            public_key=LANGFUSE_PUBLIC_KEY,
            secret_key=LANGFUSE_SECRET_KEY,
        )
        litellm.callbacks = [handler]
        _langfuse_ok = True
        logger.info("[jarvis.obs] Langfuse activo en %s", LANGFUSE_HOST)
    except Exception as e:
        logger.warning("[jarvis.obs] Langfuse no pudo iniciarse: %s", e)


def _setup_otel() -> None:
    global _otel_ok
    from jarvis.config import OTEL_EXPORTER_ENDPOINT

    if not OTEL_EXPORTER_ENDPOINT:
        logger.debug("[jarvis.obs] OTel no configurado (OTEL_EXPORTER_OTLP_ENDPOINT vacío). Audit log local.")
        return

    try:
        from opentelemetry import trace
        from opentelemetry.sdk.trace import TracerProvider
        from opentelemetry.sdk.trace.export import BatchSpanProcessor
        from opentelemetry.exporter.otlp.proto.grpc.trace_exporter import OTLPSpanExporter

        provider = TracerProvider()
        exporter = OTLPSpanExporter(endpoint=OTEL_EXPORTER_ENDPOINT, insecure=True)
        provider.add_span_processor(BatchSpanProcessor(exporter))
        trace.set_tracer_provider(provider)
        _otel_ok = True
        logger.info("[jarvis.obs] OTel activo → %s", OTEL_EXPORTER_ENDPOINT)
    except Exception as e:
        logger.warning("[jarvis.obs] OTel no pudo iniciarse: %s", e)


def get_tracer(name: str = "jarvis"):
    try:
        from opentelemetry import trace
        return trace.get_tracer(name)
    except Exception:
        return _NoopTracer()


class _NoopTracer:
    def start_as_current_span(self, *args, **kwargs):
        return _NoopSpan()


class _NoopSpan:
    def __enter__(self):
        return self

    def __exit__(self, *args):
        pass

    def set_attribute(self, *args):
        pass

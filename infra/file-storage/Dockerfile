FROM minio/minio:latest
ENV MINIO_ROOT_USER=ggg
EXPOSE 9000 9001
VOLUME ["/data"]
ENTRYPOINT ["sh", "-c", "minio server /data --console-address :9001"]

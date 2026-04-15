FROM python:3.10-slim

# 设置工作目录
WORKDIR /app

# 安装必要的系统库（如 librosa 依赖的音视频库）
RUN apt-get update && apt-get install -y \
    ffmpeg \
    libsndfile1 \
    && rm -rf /var/lib/apt/lists/*

# 复制依赖文件
COPY requirements.txt .

# 安装依赖
# 使用清华大学镜像源以确保稳定性
RUN pip install --no-cache-dir -r requirements.txt -i https://pypi.tuna.tsinghua.edu.cn/simple --trusted-host pypi.tuna.tsinghua.edu.cn

# 复制源代码
COPY app.py .

# 创建模型缓存目录并设置权限
RUN mkdir -p /app/model_cache && chmod 777 /app/model_cache

# 暴露端口
EXPOSE 8000

# 启动服务
# 添加环境变量解决 SSL 问题和国内下载慢的问题
ENV MODELSCOPE_DOMAIN=www.modelscope.cn
ENV MODELSCOPE_CACHE=/app/model_cache
ENV GIT_SSL_NO_VERIFY=true

CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8000"]

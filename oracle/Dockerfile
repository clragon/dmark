FROM ruby:3.3.1-alpine3.20

RUN apk --no-cache add build-base cmake git glib-dev ragel

WORKDIR /oracle

COPY Gemfile Gemfile.lock* ./
RUN bundle config set --local without 'development test' \
 && bundle install -j$(nproc)

COPY server.rb ./

EXPOSE 4567

ENV ORACLE_PORT=4567
CMD ["ruby", "server.rb"]

#!/usr/bin/env bash
set -euo pipefail

# Reuse existing gh authentication only. No login, token extraction, or force push.
project_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
repository='BreezeLife/trex-soft-candy'
repository_url="https://github.com/${repository}.git"
export GH_HOST=github.com GH_PROMPT_DISABLED=1 GIT_TERMINAL_PROMPT=0

die() { printf '停止：%s\n' "$*" >&2; exit 1; }
guard_ancestors() {
  local base_dir="$1" file="$2" scope="$3" ancestor_dir='' part_index
  local -a file_parts
  IFS='/' read -r -a file_parts <<< "$file"
  for ((part_index=0; part_index<${#file_parts[@]}-1; part_index++)); do
    ancestor_dir="${ancestor_dir:+$ancestor_dir/}${file_parts[$part_index]}"
    [[ ! -L "$base_dir/$ancestor_dir" ]] || die "${scope}的 ${ancestor_dir} 目录是符号链接；未覆盖。"
    [[ ! -e "$base_dir/$ancestor_dir" || -d "$base_dir/$ancestor_dir" ]] || die "${scope}的 ${ancestor_dir} 不是目录；未覆盖。"
  done
}
for dependency in gh git node curl; do
  command -v "$dependency" >/dev/null 2>&1 || die "缺少 ${dependency}。请在已配置 gh 的电脑上运行此脚本。"
done

gh auth status --hostname github.com >/dev/null 2>&1 || die '未检测到可用的 GitHub 授权；本脚本只复用已有 gh 登录，不发起网页登录。'
account="$(gh api --hostname github.com user --jq .login)"
[[ "$(printf '%s' "$account" | tr '[:upper:]' '[:lower:]')" == 'breezelife' ]] || die "当前授权账号是 ${account}，目标仓库属于 BreezeLife；未执行任何发布操作。"
node "$project_dir/scripts/check.mjs"
files=(
  index.html .nojekyll .gitignore README.md package.json SHA256SUMS
  scripts/check.mjs scripts/serve.mjs publish-github-pages.sh START_HERE.md AGENTS.md CODEX_HANDOFF.md
  PROJECT.md MEMORY.md TASKS.md WORKLOG.md TEST_REPORT.md
  tests/controls.cjs tests/fullscreen.cjs tests/adapter.cjs tests/renderer.cjs tests/physics.cjs tests/arena.cjs tests/publish.cjs
  design/toy-icons.png design/2026-10-03-toy-icons-prompt.json design/2026-10-04-two-hand-play.md design/2026-10-05-bounce-arena.md
  preview/coral.png preview/lagoon.png preview/grape.png
  android/.gitignore android/README.md android/settings.gradle android/build.gradle android/gradle.properties
  android/build-local.sh android/gradlew android/gradlew.bat
  android/gradle/wrapper/gradle-wrapper.jar android/gradle/wrapper/gradle-wrapper.properties
  android/tests/LocalContentPolicyTest.java android/app/build.gradle android/app/src/main/AndroidManifest.xml
  android/app/src/main/java/life/breeze/trexjelly/MainActivity.java
  android/app/src/main/java/life/breeze/trexjelly/LocalContentPolicy.java
  android/app/src/main/res/mipmap-anydpi-v26/ic_launcher.xml android/app/src/main/res/drawable/ic_trex_foreground.xml
  android/app/src/main/res/values/colors.xml android/app/src/main/res/values/strings.xml
  android/app/src/main/res/values/themes.xml android/app/src/main/res/values-v27/themes.xml
  android/app/src/main/res/values-en/strings.xml
  downloads/README.md downloads/trex-jelly-android-v1.3.0.apk downloads/trex-jelly-android-v1.4.0.apk downloads/trex-jelly-android-v1.5.0.apk
)
for file in "${files[@]}"; do
  guard_ancestors "$project_dir" "$file" '发布文件'
  [[ -f "$project_dir/$file" && ! -L "$project_dir/$file" ]] || die "发布文件不存在或不是普通文件：${file}"
done

work_dir="$(mktemp -d "${TMPDIR:-/tmp}/trex-pages.XXXXXX")"
trap 'rm -rf -- "$work_dir"' EXIT
publish_dir="$work_dir/repository"

# Credentials are supplied by gh's helper to these git commands only. Never
# write tokens or change the user's global git credential configuration.
git_github() {
  git -c credential.helper= -c 'credential.helper=!gh auth git-credential' "$@"
}

if repository_state="$(gh api "repos/$repository" --jq '[.private,.fork]|@tsv' 2>"$work_dir/repository-error")"; then
  [[ "$repository_state" == $'false\tfalse' ]] || die '已存在的目标仓库是私有仓库或 fork；为保护现有设置，脚本不会修改它。'
else
  if grep -Fq 'HTTP 404' "$work_dir/repository-error"; then
    gh repo create "$repository" --public --description '霸王龙软软糖 · T-Rex Jelly — a standalone, procedural WebGPU soft-body toy.'
  else
    cat "$work_dir/repository-error" >&2
    die '无法核实仓库状态，未尝试创建或覆盖仓库。'
  fi
fi

remote_refs="$(git_github ls-remote --heads --tags "$repository_url")"
if [[ -z "$remote_refs" ]]; then
  mkdir -p "$publish_dir"
  git init -q "$publish_dir"
  git -C "$publish_dir" symbolic-ref HEAD refs/heads/main
  git -C "$publish_dir" remote add origin "$repository_url"
else
  grep -q $'\trefs/heads/main$' <<< "$remote_refs" || die '已有仓库没有 main 分支；为保护现有内容，脚本不会新建或替换分支。'
  git_github clone --quiet --single-branch --branch main "$repository_url" "$publish_dir"
  [[ -f "$publish_dir/index.html" ]] || die '已有 main 分支没有本项目的 index.html；未覆盖仓库。'
  # Existing files must match this export. Preserve any additional files, and
  # refuse to overwrite differing content; review and merge it separately.
  for file in "${files[@]}"; do
    guard_ancestors "$publish_dir" "$file" '已有仓库'
    if [[ -L "$publish_dir/$file" ]]; then
      die "已有仓库的 ${file} 是符号链接；未覆盖。"
    fi
    if [[ -e "$publish_dir/$file" ]]; then
      [[ -f "$publish_dir/$file" ]] || die "已有仓库的 ${file} 不是普通文件；未覆盖。"
      cmp -s "$project_dir/$file" "$publish_dir/$file" || die "已有仓库的 ${file} 与本地不同。请先审阅并合并差异；脚本不会覆盖或强推。"
    fi
  done
fi

for file in "${files[@]}"; do
  guard_ancestors "$project_dir" "$file" '发布文件'
  [[ -f "$project_dir/$file" && ! -L "$project_dir/$file" ]] || die "发布文件不存在或不是普通文件：${file}"
  mkdir -p "$(dirname "$publish_dir/$file")"
  cp "$project_dir/$file" "$publish_dir/$file"
done
chmod +x "$publish_dir/publish-github-pages.sh"
git -C "$publish_dir" config user.name "$account"
author_email="$(gh api user --jq '"\(.id)+\(.login)@users.noreply.github.com"')"
git -C "$publish_dir" config user.email "$author_email"
git -C "$publish_dir" add -- "${files[@]}"
if ! git -C "$publish_dir" diff --cached --quiet; then
  git -C "$publish_dir" commit -m 'Publish standalone T-Rex Jelly for GitHub Pages'
fi
git_github -C "$publish_dir" push origin main

if pages_settings="$(gh api "repos/$repository/pages" --jq '[.build_type,(.source.branch // ""),(.source.path // "")]|@tsv' 2>"$work_dir/pages-error")"; then
  [[ "$pages_settings" != workflow$'\t'* ]] || die '源码已推送，但已有 Pages 使用 Actions workflow；为保护现有部署流程，未修改 Pages 设置。'
  [[ "$pages_settings" == $'legacy\tmain\t/' ]] || die '源码已推送，但已有 Pages 的发布类型、分支或目录不同；为保护现有部署配置，未修改 Pages 设置。'
  gh api --method PUT "repos/$repository/pages" -f build_type=legacy -f 'source[branch]=main' -f 'source[path]=/' >/dev/null
else
  if grep -Fq 'HTTP 404' "$work_dir/pages-error"; then
    gh api --method POST "repos/$repository/pages" -f build_type=legacy -f 'source[branch]=main' -f 'source[path]=/' >/dev/null
  else
    cat "$work_dir/pages-error" >&2
    die '源码已推送，但无法核实 Pages 状态；未修改部署设置。'
  fi
fi
pages_url="$(gh api "repos/$repository/pages" --jq .html_url)"
publish_commit="$(git -C "$publish_dir" rev-parse HEAD)"
[[ "$pages_url" == https://* ]] || die '源码已同步、Pages 已启用，但 HTTPS 地址尚未就绪；未确认上线。'
printf '\n源码已同步：https://github.com/%s\nPages 已启用：%s\n正在等待当前提交完成构建并核对线上 HTML…\n' "$repository" "$pages_url"

# A configured Pages URL is not proof of a completed deployment. Check the
# exact pushed commit, then compare the public response with the source file.
verification_deadline=$((SECONDS + 180))
verification_attempt=0
while (( SECONDS < verification_deadline )); do
  verification_attempt=$((verification_attempt + 1))
  if build_state="$(gh api "repos/$repository/pages/builds/latest" --jq '[.status,.commit]|@tsv' 2>"$work_dir/build-error")"; then
    if [[ "$build_state" == $'errored\t'"$publish_commit" ]]; then
      die "源码已同步，但 GitHub Pages 构建失败。请查看 https://github.com/$repository/actions"
    fi
    if [[ "$build_state" == $'built\t'"$publish_commit" ]]; then
      if curl --fail --silent --show-error --location --proto '=https' --proto-redir '=https' --connect-timeout 8 --max-time 15 \
        -H 'Cache-Control: no-cache' "${pages_url}?verify=${publish_commit}" \
        -o "$work_dir/live-index.html" 2>"$work_dir/http-error" && \
        cmp -s "$project_dir/index.html" "$work_dir/live-index.html"; then
        printf '\nGitHub Pages 已上线并验证：%s\n发布提交：%s\n' "$pages_url" "$publish_commit"
        exit 0
      fi
    fi
  fi
  if (( verification_attempt % 6 == 0 )); then
    printf '仍在等待构建或 HTTPS 内容就绪…\n'
  fi
  sleep 5
done
printf '\n源码已同步，Pages 已启用；等待超时，尚未验证上线。\n请稍后查看：%s\n' "$pages_url" >&2
exit 2

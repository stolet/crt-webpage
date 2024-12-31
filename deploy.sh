cp -r webpage/* stolet.github.io/
cd stolet.github.io/

git add .

msg="rebuilding site $(date)"
if [ -n "$*" ]; then
	msg="$*"
fi
git commit -m "$msg"

git push origin master